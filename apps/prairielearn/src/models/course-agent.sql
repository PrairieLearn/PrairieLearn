-- BLOCK create_conversation
INSERT INTO
  course_agent_conversations (
    id,
    course_id,
    user_id,
    title,
    sandbox_id,
    runtime_status
  )
VALUES
  (
    $conversation_id,
    $course_id,
    $user_id,
    $title,
    $sandbox_id,
    'starting'
  )
RETURNING
  *;

-- BLOCK select_owned_conversation
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $conversation_id
  AND course_id = $course_id
  AND user_id = $user_id
  AND deleted_at IS NULL;

-- BLOCK select_owned_conversations
SELECT
  *
FROM
  course_agent_conversations
WHERE
  course_id = $course_id
  AND user_id = $user_id
  AND deleted_at IS NULL
ORDER BY
  updated_at DESC;

-- BLOCK create_run
INSERT INTO
  course_agent_runs (id, conversation_id, prompt_digest)
VALUES
  ($run_id, $conversation_id, $prompt_digest)
RETURNING
  *;

-- BLOCK insert_user_message
INSERT INTO
  course_agent_messages (
    conversation_id,
    run_id,
    authn_user_id,
    role,
    content
  )
VALUES
  (
    $conversation_id,
    $run_id,
    $user_id,
    'user',
    $content
  )
RETURNING
  *;

-- BLOCK create_run_usage
INSERT INTO
  course_agent_run_usages (run_id)
VALUES
  ($run_id)
RETURNING
  *;

-- BLOCK persist_event
INSERT INTO
  course_agent_events (
    conversation_id,
    run_id,
    sequence,
    event_type,
    data
  )
VALUES
  (
    $conversation_id,
    $run_id,
    $sequence,
    $event_type,
    $data
  )
ON CONFLICT (conversation_id, sequence) DO NOTHING;

-- BLOCK update_runtime
UPDATE course_agent_conversations
SET
  runtime_status = $runtime_status,
  last_error = $last_error,
  updated_at = NOW()
WHERE
  id = $conversation_id;

-- BLOCK complete_run
UPDATE course_agent_runs
SET
  status = $status,
  error_message = $error_message,
  completed_at = NOW()
WHERE
  id = $run_id
  AND status = 'running';

-- BLOCK upsert_run_usage
INSERT INTO
  course_agent_run_usages (
    run_id,
    provider,
    model,
    input_tokens,
    cache_read_tokens,
    cache_write_tokens,
    output_tokens,
    reasoning_tokens,
    normalized_total_tokens,
    provider_cost_milli_dollars,
    estimated_cost_milli_dollars,
    finalized_at
  )
VALUES
  (
    $run_id,
    $provider,
    $model,
    $input_tokens,
    $cache_read_tokens,
    $cache_write_tokens,
    $output_tokens,
    $reasoning_tokens,
    $normalized_total_tokens,
    $provider_cost_milli_dollars,
    $estimated_cost_milli_dollars,
    $finalized_at
  )
ON CONFLICT (run_id) DO UPDATE
SET
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  input_tokens = GREATEST(
    course_agent_run_usages.input_tokens,
    EXCLUDED.input_tokens
  ),
  cache_read_tokens = GREATEST(
    course_agent_run_usages.cache_read_tokens,
    EXCLUDED.cache_read_tokens
  ),
  cache_write_tokens = GREATEST(
    course_agent_run_usages.cache_write_tokens,
    EXCLUDED.cache_write_tokens
  ),
  output_tokens = GREATEST(
    course_agent_run_usages.output_tokens,
    EXCLUDED.output_tokens
  ),
  reasoning_tokens = CASE
    WHEN EXCLUDED.reasoning_tokens IS NULL THEN course_agent_run_usages.reasoning_tokens
    ELSE GREATEST(
      COALESCE(course_agent_run_usages.reasoning_tokens, 0),
      EXCLUDED.reasoning_tokens
    )
  END,
  normalized_total_tokens = GREATEST(
    course_agent_run_usages.normalized_total_tokens,
    EXCLUDED.normalized_total_tokens
  ),
  provider_cost_milli_dollars = CASE
    WHEN EXCLUDED.provider_cost_milli_dollars IS NULL THEN course_agent_run_usages.provider_cost_milli_dollars
    ELSE GREATEST(
      COALESCE(
        course_agent_run_usages.provider_cost_milli_dollars,
        0
      ),
      EXCLUDED.provider_cost_milli_dollars
    )
  END,
  estimated_cost_milli_dollars = GREATEST(
    course_agent_run_usages.estimated_cost_milli_dollars,
    EXCLUDED.estimated_cost_milli_dollars
  ),
  finalized_at = COALESCE(
    course_agent_run_usages.finalized_at,
    EXCLUDED.finalized_at
  ),
  updated_at = NOW()
RETURNING
  *;

-- BLOCK select_conversation_usage
SELECT
  COALESCE(SUM(u.normalized_total_tokens), 0)::BIGINT AS normalized_total_tokens,
  COALESCE(SUM(u.estimated_cost_milli_dollars), 0)::BIGINT AS estimated_cost_milli_dollars
FROM
  course_agent_runs AS r
  JOIN course_agent_run_usages AS u ON (u.run_id = r.id)
WHERE
  r.conversation_id = $conversation_id;

-- BLOCK insert_assistant_message
INSERT INTO
  course_agent_messages (conversation_id, run_id, role, content)
SELECT
  $conversation_id,
  $run_id,
  'assistant',
  $content
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      course_agent_messages
    WHERE
      run_id = $run_id
      AND role = 'assistant'
  );

-- BLOCK select_messages
SELECT
  *
FROM
  course_agent_messages
WHERE
  conversation_id = $conversation_id
ORDER BY
  id;

-- BLOCK select_events
SELECT
  *
FROM
  course_agent_events
WHERE
  conversation_id = $conversation_id
ORDER BY
  sequence;

-- BLOCK insert_backup
INSERT INTO
  course_agent_workspace_backups (
    conversation_id,
    sandbox_id,
    backup_handle,
    expires_at
  )
SELECT
  $conversation_id,
  $sandbox_id,
  $backup_handle,
  $expires_at
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      course_agent_workspace_backups
    WHERE
      conversation_id = $conversation_id
      AND backup_handle = $backup_handle
  )
RETURNING
  *;

-- BLOCK select_latest_backup
SELECT
  *
FROM
  course_agent_workspace_backups
WHERE
  conversation_id = $conversation_id
  AND (
    expires_at IS NULL
    OR expires_at > NOW()
  )
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK upsert_push_approval
INSERT INTO
  course_agent_push_approvals (
    id,
    conversation_id,
    run_id,
    course_id,
    requested_by,
    repository,
    branch,
    base_sha,
    proposed_sha,
    diff_summary,
    diff
  )
VALUES
  (
    $approval_id,
    $conversation_id,
    $run_id,
    $course_id,
    $user_id,
    $repository,
    $branch,
    $base_sha,
    $proposed_sha,
    $diff_summary,
    $diff
  )
ON CONFLICT (id) DO UPDATE
SET
  diff_summary = EXCLUDED.diff_summary,
  diff = EXCLUDED.diff
RETURNING
  *;

-- BLOCK select_push_approval
SELECT
  a.*
FROM
  course_agent_push_approvals AS a
  JOIN course_agent_conversations AS c ON (c.id = a.conversation_id)
WHERE
  a.id = $approval_id
  AND c.course_id = $course_id
  AND c.user_id = $user_id
  AND c.deleted_at IS NULL;

-- BLOCK select_pending_push_approval
SELECT
  *
FROM
  course_agent_push_approvals
WHERE
  conversation_id = $conversation_id
  AND status IN ('pending', 'publishing')
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK update_push_approval
UPDATE course_agent_push_approvals
SET
  status = $status,
  decided_by = COALESCE($decided_by, decided_by),
  decided_at = CASE
    WHEN $status IN ('publishing', 'denied') THEN NOW()
    ELSE decided_at
  END,
  completed_at = CASE
    WHEN $status IN ('completed', 'failed') THEN NOW()
    ELSE completed_at
  END,
  result = $result
WHERE
  id = $approval_id
  AND status = ANY ($expected_statuses::TEXT[])
RETURNING
  *;
