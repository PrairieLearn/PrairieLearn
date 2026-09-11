-- BLOCK create_usage
INSERT INTO
  course_agent_run_usages (run_id)
VALUES
  ($run_id)
ON CONFLICT DO NOTHING;

-- BLOCK select_identity
SELECT
  c.user_id,
  c.course_id,
  r.status
FROM
  course_agent_runs AS r
  JOIN course_agent_conversations AS c ON c.id = r.conversation_id
  JOIN courses AS course ON course.id = c.course_id
  AND course.deleted_at IS NULL
WHERE
  r.id = $run_id
  AND c.id = $conversation_id
  AND c.user_id = $user_id
  AND c.course_id = $course_id
  AND c.deleted_at IS NULL;

-- BLOCK authorize_receipt
INSERT INTO
  course_agent_usage_receipts (id, run_id, provider, model)
VALUES
  ($id, $run_id, 'openai', $model)
ON CONFLICT DO NOTHING;

-- BLOCK complete_receipt
UPDATE course_agent_usage_receipts
SET
  usage = $usage,
  estimated_cost_milli_dollars = $cost,
  completed_at = now()
WHERE
  id = $id
  AND run_id = $run_id
  AND model = $model
  AND completed_at IS NULL
RETURNING
  id;

-- BLOCK add_usage
UPDATE course_agent_run_usages
SET
  input_tokens = input_tokens + $input_tokens,
  cache_read_tokens = cache_read_tokens + $cache_read_tokens,
  cache_write_tokens = cache_write_tokens + $cache_write_tokens,
  output_tokens = output_tokens + $output_tokens,
  reasoning_tokens = reasoning_tokens + $reasoning_tokens,
  normalized_total_tokens = normalized_total_tokens + $input_tokens + $output_tokens,
  estimated_cost_milli_dollars = estimated_cost_milli_dollars + $cost,
  updated_at = now()
WHERE
  run_id = $run_id;

-- BLOCK finalize_usage
UPDATE course_agent_run_usages
SET
  finalized_at = coalesce(finalized_at, now())
WHERE
  run_id = $run_id;

-- BLOCK select_usages
SELECT
  u.*
FROM
  course_agent_run_usages AS u
  JOIN course_agent_runs AS r ON r.id = u.run_id
WHERE
  r.conversation_id = $conversation_id
ORDER BY
  r.created_at;
