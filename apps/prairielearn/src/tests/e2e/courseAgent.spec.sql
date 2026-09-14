-- BLOCK archive_conversations
UPDATE course_agent_conversations
SET
  deleted_at = NOW()
WHERE
  course_id = $course_id
  AND deleted_at IS NULL;

-- BLOCK set_activity
UPDATE course_agent_conversations
SET
  runtime_status = $status
WHERE
  id = $conversation_id;
