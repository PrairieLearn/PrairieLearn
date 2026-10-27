-- BLOCK insert_course_agent_conversation
INSERT INTO
  course_agent_conversations (course_id, user_id, agent_conversation_id, title)
VALUES
  (
    $course_id,
    $user_id,
    $agent_conversation_id,
    $title
  )
RETURNING
  *;

-- BLOCK select_course_agent_conversations_for_user
SELECT
  *
FROM
  course_agent_conversations
WHERE
  course_id = $course_id
  AND user_id = $user_id
ORDER BY
  created_at DESC,
  id DESC;

-- BLOCK select_course_agent_conversation
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $id
  AND course_id = $course_id
  AND user_id = $user_id;
