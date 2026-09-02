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
