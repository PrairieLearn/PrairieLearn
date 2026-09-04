-- BLOCK archive_conversations
UPDATE course_agent_conversations
SET
  deleted_at = NOW()
WHERE
  course_id = $course_id
  AND deleted_at IS NULL;
