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

-- BLOCK update_conversation_title
UPDATE course_agent_conversations
SET
  title = $title
WHERE
  id = $id
  AND title = 'New conversation';

-- BLOCK select_conversation_by_external_id
SELECT
  *
FROM
  course_agent_conversations
WHERE
  external_id = $external_id
  AND course_id = $course_id
  AND user_id = $user_id;

-- BLOCK update_conversation_finished
UPDATE course_agent_conversations
SET
  last_finished_at = GREATEST(last_finished_at, $finished_at::timestamptz)
WHERE
  id = $id;

-- BLOCK select_conversation_context
SELECT
  c.course_id,
  c.user_id,
  courses.deleted_at
FROM
  course_agent_conversations AS c
  JOIN courses ON courses.id = c.course_id
WHERE
  c.external_id = $external_id;
