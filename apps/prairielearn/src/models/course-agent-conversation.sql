-- BLOCK list
SELECT
  *
FROM
  course_agent_conversations
WHERE
  course_id = $course_id
  AND user_id = $user_id
ORDER BY
  created_at DESC;

-- BLOCK select
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $id
  AND course_id = $course_id
  AND user_id = $user_id;

-- BLOCK lock
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $id
FOR UPDATE;

-- BLOCK insert
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

-- BLOCK operation
SELECT
  *
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND operation_id = $operation_id;

-- BLOCK same_operation
SELECT
  payload = $payload::jsonb AS same
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND operation_id = $operation_id;

-- BLOCK advance
UPDATE course_agent_conversations
SET
  revision = revision + 1
WHERE
  id = $id
RETURNING
  revision;

-- BLOCK admit
INSERT INTO
  course_agent_operations (conversation_id, operation_id, payload, revision)
VALUES
  ($id, $operation_id, $payload, $revision);

-- BLOCK pending
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

-- BLOCK activity
SELECT
  to_jsonb(c.*) AS conversation,
  EXISTS (
    SELECT
      1
    FROM
      course_agent_executions e
    WHERE
      e.conversation_id = c.id
      AND e.status IN ('admitted', 'running')
  ) AS running,
  (
    SELECT
      max(e.finished_at)
    FROM
      course_agent_executions e
    WHERE
      e.conversation_id = c.id
  ) AS finished_at
FROM
  course_agent_conversations c
WHERE
  c.course_id = $course_id
  AND c.user_id = $user_id
ORDER BY
  c.created_at DESC;

-- BLOCK name
UPDATE course_agent_conversations
SET
  title = $title
WHERE
  id = $id
  AND title = 'New conversation';

-- BLOCK operations
SELECT
  *
FROM
  course_agent_operations
WHERE
  conversation_id = $id
  AND payload ->> 'kind' = 'message';
