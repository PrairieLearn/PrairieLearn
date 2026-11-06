-- BLOCK insert_usage_report
INSERT INTO
  course_agent_usage_reports (
    course_agent_conversation_id,
    user_id,
    report_id,
    model,
    input_tokens,
    input_tokens_cache_read,
    output_tokens,
    output_tokens_reasoning,
    cost_milli_dollars
  )
VALUES
  (
    $course_agent_conversation_id,
    $user_id,
    $report_id,
    $model,
    $input_tokens,
    $input_tokens_cache_read,
    $output_tokens,
    $output_tokens_reasoning,
    $cost_milli_dollars
  )
ON CONFLICT (course_agent_conversation_id, report_id) DO NOTHING
RETURNING
  id;

-- BLOCK select_usage_report
SELECT
  *
FROM
  course_agent_usage_reports
WHERE
  course_agent_conversation_id = $course_agent_conversation_id
  AND report_id = $report_id;

-- BLOCK select_user_cost_since
SELECT
  coalesce(sum(cost_milli_dollars), 0)
FROM
  course_agent_usage_reports
WHERE
  user_id = $user_id
  AND created_at >= $since;

-- BLOCK select_conversation_usage
SELECT
  coalesce(sum(input_tokens), 0) AS input_tokens,
  coalesce(sum(input_tokens_cache_read), 0) AS input_tokens_cache_read,
  coalesce(sum(output_tokens), 0) AS output_tokens,
  coalesce(sum(output_tokens_reasoning), 0) AS output_tokens_reasoning,
  coalesce(sum(cost_milli_dollars), 0) AS cost_milli_dollars
FROM
  course_agent_usage_reports
WHERE
  course_agent_conversation_id = $course_agent_conversation_id;
