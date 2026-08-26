-- BLOCK insert_conversation
INSERT INTO
  course_agent_conversations (course_id, user_id, title, course_path)
VALUES
  ($course_id, $user_id, $title, $course_path)
RETURNING
  *;

-- BLOCK select_conversations
SELECT
  *
FROM
  course_agent_conversations
WHERE
  course_id = $course_id
  AND user_id = $user_id
  AND deleted_at IS NULL
ORDER BY
  updated_at DESC,
  id DESC;

-- BLOCK select_conversation
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $conversation_id
  AND course_id = $course_id
  AND user_id = $user_id
  AND deleted_at IS NULL;

-- BLOCK select_conversation_by_id
SELECT
  *
FROM
  course_agent_conversations
WHERE
  id = $conversation_id
  AND deleted_at IS NULL;

-- BLOCK update_conversation_title
UPDATE course_agent_conversations
SET
  title = $title,
  updated_at = NOW()
WHERE
  id = $conversation_id
RETURNING
  *;

-- BLOCK update_conversation_runtime
UPDATE course_agent_conversations
SET
  runtime_status = $runtime_status,
  container_id = $container_id,
  course_path = $course_path,
  last_activity_at = $last_activity_at,
  idle_deadline_at = $idle_deadline_at,
  last_error = $last_error,
  updated_at = NOW()
WHERE
  id = $conversation_id
RETURNING
  *;

-- BLOCK mark_conversation_deleted
UPDATE course_agent_conversations
SET
  deleted_at = NOW(),
  updated_at = NOW()
WHERE
  id = $conversation_id
RETURNING
  *;

-- BLOCK insert_run
INSERT INTO
  course_agent_runs (conversation_id, prompt_digest, base_commit_sha)
VALUES
  (
    $conversation_id,
    $prompt_digest,
    $base_commit_sha
  )
RETURNING
  *;

-- BLOCK select_run
SELECT
  *
FROM
  course_agent_runs
WHERE
  id = $run_id
  AND conversation_id = $conversation_id;

-- BLOCK select_active_run
SELECT
  *
FROM
  course_agent_runs
WHERE
  conversation_id = $conversation_id
  AND status IN (
    'queued',
    'preparing',
    'running',
    'finalizing',
    'syncing',
    'checkpointing'
  )
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK select_latest_run
SELECT
  *
FROM
  course_agent_runs
WHERE
  conversation_id = $conversation_id
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK update_run
UPDATE course_agent_runs
SET
  status = $status,
  base_commit_sha = COALESCE($base_commit_sha, base_commit_sha),
  commit_sha = COALESCE($commit_sha, commit_sha),
  pushed_sha = COALESCE($pushed_sha, pushed_sha),
  sync_job_sequence_id = COALESCE($sync_job_sequence_id, sync_job_sequence_id),
  error_code = $error_code,
  error_message = $error_message,
  started_at = CASE
    WHEN $mark_started::BOOLEAN
    AND started_at IS NULL THEN NOW()
    ELSE started_at
  END,
  completed_at = CASE
    WHEN $mark_completed::BOOLEAN THEN NOW()
    ELSE completed_at
  END
WHERE
  id = $run_id
RETURNING
  *;

-- BLOCK insert_message
INSERT INTO
  course_agent_messages (
    conversation_id,
    run_id,
    authn_user_id,
    role,
    status,
    parts,
    metadata
  )
VALUES
  (
    $conversation_id,
    $run_id,
    $authn_user_id,
    $role,
    $status,
    $parts,
    $metadata
  )
RETURNING
  *;

-- BLOCK select_messages
SELECT
  *
FROM
  course_agent_messages
WHERE
  conversation_id = $conversation_id
ORDER BY
  id;

-- BLOCK update_assistant_message
UPDATE course_agent_messages
SET
  status = $status,
  parts = $parts,
  metadata = $metadata,
  updated_at = NOW()
WHERE
  conversation_id = $conversation_id
  AND run_id = $run_id
  AND role = 'assistant'
RETURNING
  *;

-- BLOCK insert_event
WITH
  locked_conversation AS (
    SELECT
      id
    FROM
      course_agent_conversations
    WHERE
      id = $conversation_id
    FOR UPDATE
  ),
  next_sequence AS (
    SELECT
      COALESCE(MAX(sequence), 0) + 1 AS sequence
    FROM
      course_agent_events
    WHERE
      conversation_id = $conversation_id
  )
INSERT INTO
  course_agent_events (
    conversation_id,
    run_id,
    sequence,
    external_event_id,
    event_type,
    data
  )
SELECT
  locked_conversation.id,
  $run_id,
  next_sequence.sequence,
  $external_event_id,
  $event_type,
  $data
FROM
  locked_conversation
  CROSS JOIN next_sequence
ON CONFLICT (external_event_id) DO NOTHING
RETURNING
  *;

-- BLOCK select_events
SELECT
  *
FROM
  course_agent_events
WHERE
  conversation_id = $conversation_id
  AND sequence > $after_sequence
ORDER BY
  sequence
LIMIT
  $limit;

-- BLOCK insert_backup
INSERT INTO
  course_agent_workspace_backups (
    conversation_id,
    run_id,
    sandbox_id,
    backup_handle,
    workspace_manifest_version,
    course_commit_sha,
    reason,
    size_bytes,
    expires_at
  )
VALUES
  (
    $conversation_id,
    $run_id,
    $sandbox_id,
    $backup_handle,
    $workspace_manifest_version,
    $course_commit_sha,
    $reason,
    $size_bytes,
    $expires_at
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
ORDER BY
  id DESC
LIMIT
  1;
