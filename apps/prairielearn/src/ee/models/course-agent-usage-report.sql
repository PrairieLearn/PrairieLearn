-- BLOCK insert_usage_report
INSERT INTO
  course_agent_usage_reports (
    course_agent_conversation_id,
    user_id,
    report_id,
    model,
    input_tokens,
    input_tokens_cache_read,
    input_tokens_cache_write,
    output_tokens,
    output_tokens_reasoning,
    web_search_calls,
    cost
  )
VALUES
  (
    $course_agent_conversation_id,
    $user_id,
    $report_id,
    $model,
    $input_tokens,
    $input_tokens_cache_read,
    $input_tokens_cache_write,
    $output_tokens,
    $output_tokens_reasoning,
    $web_search_calls,
    $cost
  )
ON CONFLICT (course_agent_conversation_id, report_id) DO NOTHING;

-- BLOCK select_user_cost_since
SELECT
  coalesce(sum(cost), 0)
FROM
  course_agent_usage_reports
WHERE
  user_id = $user_id
  AND created_at >= $since;

-- BLOCK select_conversation_usage
SELECT
  coalesce(sum(input_tokens), 0) AS input_tokens,
  coalesce(sum(input_tokens_cache_read), 0) AS input_tokens_cache_read,
  coalesce(sum(input_tokens_cache_write), 0) AS input_tokens_cache_write,
  coalesce(sum(output_tokens), 0) AS output_tokens,
  coalesce(sum(output_tokens_reasoning), 0) AS output_tokens_reasoning,
  coalesce(sum(web_search_calls), 0) AS web_search_calls,
  coalesce(sum(cost), 0) AS cost
FROM
  course_agent_usage_reports
WHERE
  course_agent_conversation_id = $course_agent_conversation_id;
