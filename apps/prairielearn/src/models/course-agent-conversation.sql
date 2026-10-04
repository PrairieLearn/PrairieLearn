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
      course_agent_executions AS e
    WHERE
      e.conversation_id = c.id
      AND e.status IN ('admitted', 'running')
  ) AS running,
  (
    SELECT
      max(e.finished_at)
    FROM
      course_agent_executions AS e
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
