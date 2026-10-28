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

-- BLOCK add_usage
UPDATE course_agent_conversations
SET
  usage_input_tokens = usage_input_tokens + $input,
  usage_input_tokens_cache_read = usage_input_tokens_cache_read + $cached,
  usage_output_tokens = usage_output_tokens + $output,
  usage_output_tokens_reasoning = usage_output_tokens_reasoning + $reasoning,
  usage_cost_milli_dollars = usage_cost_milli_dollars + $cost,
  usage_report_sequence = $sequence,
  usage_report_request = $request::jsonb,
  usage_report_response = $response::jsonb
WHERE
  id = $id;

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

-- BLOCK select_course_agent_conversation_by_agent_id
SELECT
  cac.*
FROM
  course_agent_conversations AS cac
  JOIN courses AS c ON c.id = cac.course_id
  AND c.deleted_at IS NULL
WHERE
  cac.agent_conversation_id = $agent_conversation_id;

-- BLOCK select_course_agent_conversation_by_agent_id_for_update
SELECT
  *
FROM
  course_agent_conversations
WHERE
  agent_conversation_id = $agent_conversation_id
FOR UPDATE;
