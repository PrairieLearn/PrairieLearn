-- BLOCK existing
SELECT
  *
FROM
  course_agent_executions
WHERE
  operation_id = $operation_id
  AND conversation_id = $conversation_id;

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
        e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ),
    0
  )::double precision AS cost
FROM
  course_agent_executions e
  JOIN course_agent_conversations c ON c.id = e.conversation_id
WHERE
  c.user_id = $user_id
  OR c.course_id = $course_id;

-- BLOCK recent
SELECT
  count(*)::integer AS requests
FROM
  course_agent_operations o
  JOIN course_agent_conversations c ON c.id = o.conversation_id
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
ON CONFLICT (operation_id) DO NOTHING;

-- BLOCK update
UPDATE course_agent_executions
SET
  status = $status,
  input_tokens = GREATEST(input_tokens, $input),
  cached_input_tokens = GREATEST(cached_input_tokens, $cached),
  output_tokens = GREATEST(output_tokens, $output),
  estimated_cost = GREATEST(estimated_cost, $cost),
  model = $model,
  pricing = COALESCE(pricing, $pricing),
  finished_at = CASE
    WHEN $status = 'running' THEN NULL
    ELSE COALESCE(finished_at, now())
  END
WHERE
  operation_id = $operation_id
  AND conversation_id = $conversation_id
  AND (
    status IN ('admitted', 'running')
    OR $status <> 'running'
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
  course_agent_conversations c
  JOIN course_agent_executions e ON e.conversation_id = c.id
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
  AND status = 'admitted';
