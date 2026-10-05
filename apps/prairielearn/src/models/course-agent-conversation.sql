-- BLOCK select_conversations
SELECT
  *
FROM
  course_agent_conversations
WHERE
  course_id = $course_id
  AND user_id = $user_id
ORDER BY
  created_at DESC;

-- BLOCK select_conversation
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $id
  AND course_id = $course_id
  AND user_id = $user_id;

-- BLOCK select_conversation_for_update
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $id
FOR UPDATE;

-- BLOCK insert_conversation
INSERT INTO
  course_agent_conversations (
    course_id,
    user_id,
    external_id,
    title,
    repository,
    branch
  )
VALUES
  (
    $course_id,
    $user_id,
    $external_id,
    $title,
    $repository,
    $branch
  )
RETURNING
  *;

-- BLOCK select_operation
SELECT
  *
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND operation_id = $operation_id;

-- BLOCK select_operation_payload_matches
SELECT
  payload = $payload::jsonb AS same
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND operation_id = $operation_id;

-- BLOCK increment_operation_number
UPDATE course_agent_conversations
SET
  operation_number = operation_number + 1
WHERE
  id = $id
RETURNING
  operation_number;

-- BLOCK insert_operation
INSERT INTO
  course_agent_operations (
    conversation_id,
    operation_id,
    payload,
    operation_number
  )
VALUES
  ($id, $operation_id, $payload, $operation_number);

-- BLOCK select_pending_proposal_exists
SELECT
  EXISTS (
    SELECT
      1
    FROM
      course_agent_proposals
    WHERE
      conversation_id = $id
      AND NOT delivered
  ) AS pending;

-- BLOCK select_conversation_activity
SELECT
  to_jsonb(c.*) AS conversation,
  EXISTS (
    SELECT
      1
    FROM
      course_agent_operations AS e
    WHERE
      e.conversation_id = c.id
      AND e.status IN ('admitted', 'running')
  ) AS running,
  (
    SELECT
      max(e.finished_at)
    FROM
      course_agent_operations AS e
    WHERE
      e.conversation_id = c.id
  ) AS finished_at
FROM
  course_agent_conversations AS c
WHERE
  c.course_id = $course_id
  AND c.user_id = $user_id
ORDER BY
  c.created_at DESC;

-- BLOCK update_conversation_title
UPDATE course_agent_conversations
SET
  title = $title
WHERE
  id = $id
  AND title = 'New conversation';

-- BLOCK select_message_operations
SELECT
  *
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND payload ->> 'kind' = 'message';

-- BLOCK select_active_operations
SELECT
  *
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND status IN ('admitted', 'running');

-- BLOCK retry_operation
UPDATE course_agent_operations
SET
  status = 'admitted',
  dispatch_id = gen_random_uuid(),
  admitted_at = now(),
  finished_at = NULL
WHERE
  conversation_id = $id
  AND operation_id = $operation_id;

-- BLOCK reject_operation
UPDATE course_agent_operations
SET
  status = 'rejected',
  finished_at = now()
WHERE
  conversation_id = $id
  AND operation_id = $operation_id
  AND dispatch_id = $dispatch_id
  AND status = 'admitted';

-- BLOCK update_operation_statuses
UPDATE course_agent_operations AS o
SET
  status = v.status,
  finished_at = CASE
    WHEN v.status = 'running' THEN NULL
    ELSE now()
  END
FROM
  jsonb_to_recordset($updates::jsonb) AS v (operation_id uuid, dispatch_id uuid, status text)
WHERE
  o.conversation_id = $id
  AND o.operation_id = v.operation_id
  AND o.dispatch_id = v.dispatch_id
  AND o.status IN ('admitted', 'running')
  AND o.status <> v.status;

-- BLOCK update_conversation_usage
UPDATE course_agent_conversations
SET
  usage = $usage::jsonb
WHERE
  id = $id
  AND (
    usage IS NULL
    OR (usage ->> 'version')::bigint < $version
    OR (
      (usage ->> 'version')::bigint = $version
      AND usage -> 'pricing' = 'null'::jsonb
    )
  );

-- BLOCK select_conversation_by_id
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $id;

-- BLOCK select_user_accounting_conversations
SELECT
  c.*
FROM
  course_agent_conversations AS c
  JOIN courses AS course ON course.id = c.course_id
  AND course.deleted_at IS NULL
WHERE
  c.user_id = $user_id
  AND (
    c.usage IS NOT NULL
    OR EXISTS (
      SELECT
        1
      FROM
        course_agent_operations AS o
      WHERE
        o.conversation_id = c.id
    )
  );

-- BLOCK select_user_capacity
WITH
  activity AS (
    SELECT
      c.id,
      EXISTS (
        SELECT
          1
        FROM
          course_agent_operations AS o
        WHERE
          o.conversation_id = c.id
          AND o.status IN ('admitted', 'running')
      ) AS active,
      EXISTS (
        SELECT
          1
        FROM
          course_agent_operations AS o
        WHERE
          o.conversation_id = c.id
          AND o.status <> 'rejected'
      )
      AND (
        c.usage IS NULL
        OR c.usage -> 'estimatedCost' = 'null'::jsonb
      ) AS unknown
    FROM
      course_agent_conversations AS c
      JOIN courses AS course ON course.id = c.course_id
      AND course.deleted_at IS NULL
    WHERE
      c.user_id = $user_id
  )
SELECT
  count(*) FILTER (
    WHERE
      active
  )::integer AS active,
  COALESCE(
    bool_or(active) FILTER (
      WHERE
        id = $id
    ),
    FALSE
  ) AS current_active,
  COALESCE(bool_or(unknown), FALSE) AS unknown
FROM
  activity;
