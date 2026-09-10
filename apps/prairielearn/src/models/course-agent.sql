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
  c.*,
  coalesce(last_message.created_at, c.created_at) AS last_message_at
FROM
  course_agent_conversations AS c
  LEFT JOIN LATERAL (
    SELECT
      m.created_at
    FROM
      course_agent_messages AS m
    WHERE
      m.conversation_id = c.id
    ORDER BY
      m.id DESC
    LIMIT
      1
  ) AS last_message ON TRUE
WHERE
  c.course_id = $course_id
  AND c.user_id = $user_id
  AND c.deleted_at IS NULL
ORDER BY
  last_message_at DESC,
  c.created_at DESC;

-- BLOCK mark_starting
UPDATE course_agent_conversations
SET
  runtime_status = 'starting',
  conversation_state = 'working',
  sandbox_state = CASE
    WHEN sandbox_state = 'offline' THEN 'starting'
    ELSE sandbox_state
  END,
  idle_expires_at = NULL,
  updated_at = NOW()
WHERE
  id = $conversation_id;

-- BLOCK create_run
INSERT INTO
  course_agent_runs (id, conversation_id, prompt_digest)
VALUES
  ($run_id, $conversation_id, $prompt_digest)
RETURNING
  *;

-- BLOCK select_conversations_to_reconcile
SELECT
  to_jsonb(c.*) AS conversation,
  to_jsonb(latest_run.*) AS run,
  to_jsonb(course.*) AS course
FROM
  course_agent_conversations AS c
  JOIN courses AS course ON course.id = c.course_id
  AND course.deleted_at IS NULL
  JOIN LATERAL (
    SELECT
      r.*
    FROM
      course_agent_runs AS r
    WHERE
      r.conversation_id = c.id
    ORDER BY
      r.created_at DESC,
      r.id DESC
    LIMIT
      1
  ) AS latest_run ON TRUE
WHERE
  c.deleted_at IS NULL
  AND (
    c.sandbox_state <> 'offline'
    OR c.conversation_state NOT IN ('waiting_for_user', 'failed')
  )
ORDER BY
  c.updated_at;

-- BLOCK select_running_run
SELECT
  *
FROM
  course_agent_runs
WHERE
  conversation_id = $conversation_id
  AND status = 'running';

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
    data,
    created_at
  )
VALUES
  (
    $conversation_id,
    $run_id,
    $sequence,
    $event_type,
    $data,
    $created_at
  )
ON CONFLICT (conversation_id, sequence) DO NOTHING;

-- BLOCK update_runtime
UPDATE course_agent_conversations
SET
  runtime_status = $runtime_status,
  conversation_state = COALESCE($conversation_state, conversation_state),
  sandbox_state = COALESCE($sandbox_state, sandbox_state),
  lifecycle_revision = $lifecycle_revision,
  sandbox_generation = $sandbox_generation,
  idle_expires_at = $idle_expires_at,
  active_run_expires_at = $active_run_expires_at,
  process_id = $process_id,
  last_error = $last_error,
  updated_at = NOW()
WHERE
  id = $conversation_id
  AND lifecycle_revision <= $lifecycle_revision
RETURNING
  *;

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

-- BLOCK update_title
UPDATE course_agent_conversations
SET
  title = $title
WHERE
  id = $conversation_id
  AND deleted_at IS NULL
  AND title = 'New conversation';
