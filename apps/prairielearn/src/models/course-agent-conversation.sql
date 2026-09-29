-- BLOCK list
SELECT
  *
FROM
  course_agent_conversations
WHERE
  course_id = $course_id
  AND user_id = $user_id
  AND archived_at IS NULL
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
  AND user_id = $user_id
  AND archived_at IS NULL;

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

-- BLOCK edit
UPDATE course_agent_conversations
SET
  title = COALESCE($title, title),
  archived_at = CASE
    WHEN $archive THEN now()
    ELSE archived_at
  END
WHERE
  id = $id
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
