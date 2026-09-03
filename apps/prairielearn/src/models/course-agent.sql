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
    commit_message,
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
    $commit_message,
    $diff_summary,
    $diff
  )
ON CONFLICT (id) DO UPDATE
SET
  commit_message = EXCLUDED.commit_message,
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
