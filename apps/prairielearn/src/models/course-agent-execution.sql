-- BLOCK existing
SELECT
  *
FROM
  course_agent_executions
WHERE
  operation_id = $operation_id
  AND conversation_id = $conversation_id;

-- BLOCK list
SELECT
  *
FROM
  course_agent_executions
WHERE
  conversation_id = $conversation_id;

-- BLOCK stats
SELECT
  count(DISTINCT c.id) FILTER (
    WHERE
      e.status IN ('admitted', 'running')
      AND c.user_id = $user_id
  )::integer AS user_active,
  count(DISTINCT c.id) FILTER (
    WHERE
      e.status IN ('admitted', 'running')
      AND c.course_id = $course_id
  )::integer AS course_active,
  COALESCE(
    sum(e.estimated_cost) FILTER (
      WHERE
        c.user_id = $user_id
        AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ),
    0
  )::double precision AS user_cost,
  COALESCE(
    sum(e.estimated_cost) FILTER (
      WHERE
        c.course_id = $course_id
        AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ),
    0
  )::double precision AS course_cost,
  count(*) FILTER (
    WHERE
      c.user_id = $user_id
      AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND e.status NOT IN ('admitted', 'running')
      AND e.model IS NOT NULL
      AND e.estimated_cost IS NULL
  )::integer AS user_unknown_cost,
  count(*) FILTER (
    WHERE
      c.course_id = $course_id
      AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND e.status NOT IN ('admitted', 'running')
      AND e.model IS NOT NULL
      AND e.estimated_cost IS NULL
  )::integer AS course_unknown_cost
FROM
  course_agent_executions AS e
  JOIN course_agent_conversations AS c ON c.id = e.conversation_id
WHERE
  c.user_id = $user_id
  OR c.course_id = $course_id;

-- BLOCK recent
SELECT
  count(*)::integer AS requests
FROM
  course_agent_operations AS o
  JOIN course_agent_conversations AS c ON c.id = o.conversation_id
WHERE
  c.user_id = $user_id
  AND o.created_at > now() - interval '1 hour'
  AND o.payload ->> 'kind' = 'message';

-- BLOCK active
SELECT
  EXISTS (
    SELECT
      1
    FROM
      course_agent_executions
    WHERE
      conversation_id = $conversation_id
      AND status IN ('admitted', 'running')
  ) AS active;

-- BLOCK insert
INSERT INTO
  course_agent_executions (conversation_id, operation_id, status)
VALUES
  ($conversation_id, $operation_id, 'admitted')
ON CONFLICT (conversation_id, operation_id) DO UPDATE
SET
  status = 'admitted',
  dispatch_id = gen_random_uuid(),
  admitted_at = now(),
  input_tokens = CASE
    WHEN course_agent_executions.model IS NULL THEN NULL
    ELSE course_agent_executions.input_tokens
  END,
  cached_input_tokens = CASE
    WHEN course_agent_executions.model IS NULL THEN NULL
    ELSE course_agent_executions.cached_input_tokens
  END,
  output_tokens = CASE
    WHEN course_agent_executions.model IS NULL THEN NULL
    ELSE course_agent_executions.output_tokens
  END,
  estimated_cost = CASE
    WHEN course_agent_executions.model IS NULL THEN NULL
    ELSE course_agent_executions.estimated_cost
  END,
  finished_at = NULL
WHERE
  course_agent_executions.status IN ('failed', 'cancelled', 'interrupted')
  AND (
    $retry_result
    OR course_agent_executions.model IS NULL
  );

-- BLOCK update
UPDATE course_agent_executions AS e
SET
  -- The first terminal receipt is authoritative; later receipts may still
  -- contribute higher usage totals without rewriting the execution outcome.
  status = CASE
    WHEN e.status IN ('admitted', 'running') THEN v.status
    ELSE e.status
  END,
  input_tokens = GREATEST(e.input_tokens, v.input),
  cached_input_tokens = GREATEST(e.cached_input_tokens, v.cached),
  output_tokens = GREATEST(e.output_tokens, v.output),
  -- A receipt with unknown usage invalidates a previous estimate (e.g. an older
  -- Worker that omitted cache-write counts). Admission must fail closed.
  estimated_cost = CASE
    WHEN v.input IS NOT NULL
    AND v.cost IS NULL THEN NULL
    ELSE GREATEST(e.estimated_cost, v.cost)
  END,
  model = v.model,
  pricing = COALESCE(e.pricing, v.pricing),
  finished_at = CASE
    WHEN v.status = 'running'
    AND e.status NOT IN ('admitted', 'running') THEN e.finished_at
    WHEN v.status = 'running' THEN NULL
    ELSE COALESCE(e.finished_at, now())
  END
FROM
  jsonb_to_recordset($updates::jsonb) AS v (
    operation_id uuid,
    dispatch_id uuid,
    status text,
    input bigint,
    cached bigint,
    output bigint,
    cost double precision,
    model text,
    pricing jsonb
  )
WHERE
  e.operation_id = v.operation_id
  AND e.dispatch_id = v.dispatch_id
  AND e.conversation_id = $conversation_id
  AND (
    e.status IN ('admitted', 'running')
    OR v.status <> 'running'
  );

-- BLOCK summary
SELECT
  CASE
    WHEN count(*) FILTER (
      WHERE
        input_tokens IS NULL
    ) > 0 THEN NULL
    ELSE COALESCE(sum(input_tokens), 0)
  END::double precision AS input,
  CASE
    WHEN count(*) FILTER (
      WHERE
        output_tokens IS NULL
    ) > 0 THEN NULL
    ELSE COALESCE(sum(output_tokens), 0)
  END::double precision AS output,
  CASE
    WHEN count(*) FILTER (
      WHERE
        estimated_cost IS NULL
    ) > 0 THEN NULL
    ELSE COALESCE(sum(estimated_cost), 0)
  END::double precision AS "estimatedCost"
FROM
  course_agent_executions
WHERE
  conversation_id = $conversation_id;

-- BLOCK active_conversations
SELECT DISTINCT
  c.*
FROM
  course_agent_conversations AS c
  JOIN course_agent_executions AS e ON e.conversation_id = c.id
WHERE
  (
    c.course_id = $course_id
    OR c.user_id = $user_id
  )
  AND e.status IN ('admitted', 'running');

-- BLOCK reject
UPDATE course_agent_executions
SET
  status = 'failed',
  input_tokens = 0,
  cached_input_tokens = 0,
  output_tokens = 0,
  estimated_cost = 0,
  finished_at = now()
WHERE
  conversation_id = $conversation_id
  AND operation_id = $operation_id
  AND (
    $dispatch_id::uuid IS NULL
    OR dispatch_id = $dispatch_id
  )
  AND status = 'admitted';
