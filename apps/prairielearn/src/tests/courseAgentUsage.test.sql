-- BLOCK course
SELECT
  id
FROM
  courses
WHERE
  deleted_at IS NULL
ORDER BY
  id
LIMIT
  1;

-- BLOCK clear
DELETE FROM course_agent_conversations;

-- BLOCK age
UPDATE course_agent_executions
SET
  admitted_at = now() - interval '3 minutes'
WHERE
  conversation_id = $conversation_id;
