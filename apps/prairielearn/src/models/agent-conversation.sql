-- BLOCK insert_conversation
INSERT INTO
  agent_conversations (
    course_id,
    authn_user_id,
    user_id,
    title,
    repository_url,
    repository_branch,
    repository_base_sha
  )
VALUES
  (
    $course_id,
    $authn_user_id,
    $user_id,
    $title,
    $repository_url,
    $repository_branch,
    $repository_base_sha
  )
RETURNING
  *;

-- BLOCK select_conversation
SELECT
  *
FROM
  agent_conversations
WHERE
  id = $conversation_id
  AND course_id = $course_id
  AND authn_user_id = $authn_user_id
  AND deleted_at IS NULL;

-- BLOCK select_conversations
SELECT
  *
FROM
  agent_conversations
WHERE
  course_id = $course_id
  AND authn_user_id = $authn_user_id
  AND deleted_at IS NULL
ORDER BY
  updated_at DESC,
  id DESC;

-- BLOCK select_runs
SELECT
  agent_runs.*
FROM
  agent_runs
  JOIN agent_conversations ON (
    agent_conversations.id = agent_runs.conversation_id
  )
WHERE
  agent_runs.conversation_id = $conversation_id
  AND agent_conversations.course_id = $course_id
ORDER BY
  agent_runs.created_at,
  agent_runs.id;

-- BLOCK select_run
SELECT
  agent_runs.*
FROM
  agent_runs
  JOIN agent_conversations ON (
    agent_conversations.id = agent_runs.conversation_id
  )
WHERE
  agent_runs.id = $run_id
  AND agent_conversations.course_id = $course_id
  AND agent_conversations.deleted_at IS NULL;

-- BLOCK select_run_for_update
SELECT
  *
FROM
  agent_runs
WHERE
  id = $run_id
  AND conversation_id = $conversation_id
FOR UPDATE;

-- BLOCK select_latest_run
SELECT
  agent_runs.*
FROM
  agent_runs
  JOIN agent_conversations ON (
    agent_conversations.id = agent_runs.conversation_id
  )
WHERE
  agent_runs.conversation_id = $conversation_id
  AND agent_conversations.course_id = $course_id
ORDER BY
  agent_runs.created_at DESC,
  agent_runs.id DESC
LIMIT
  1;

-- BLOCK select_artifacts
SELECT
  *
FROM
  agent_artifacts
WHERE
  conversation_id = $conversation_id
  AND deleted_at IS NULL
ORDER BY
  created_at,
  id;

-- BLOCK select_agent_draft_question
SELECT
  *
FROM
  agent_draft_questions
WHERE
  conversation_id = $conversation_id
  AND requested_qid = $requested_qid;

-- BLOCK reserve_agent_draft_question
INSERT INTO
  agent_draft_questions (conversation_id, requested_qid)
VALUES
  ($conversation_id, $requested_qid)
ON CONFLICT (conversation_id, requested_qid) DO NOTHING
RETURNING
  *;

-- BLOCK complete_agent_draft_question
WITH
  metadata AS (
    INSERT INTO
      draft_question_metadata (question_id, created_by, updated_by)
    VALUES
      ($question_id, $user_id, $user_id)
    ON CONFLICT (question_id) DO NOTHING
  )
UPDATE agent_draft_questions
SET
  question_id = $question_id
WHERE
  id = $id
  AND question_id IS NULL
RETURNING
  *;

-- BLOCK release_agent_draft_question
DELETE FROM agent_draft_questions
WHERE
  id = $id
  AND question_id IS NULL;

-- BLOCK select_agent_draft_question_ids
SELECT
  question_id
FROM
  agent_draft_questions
WHERE
  conversation_id = $conversation_id
  AND question_id IS NOT NULL;

-- BLOCK insert_run
INSERT INTO
  agent_runs (
    conversation_id,
    authn_user_id,
    user_id,
    message,
    capability_jti,
    capability_expires_at,
    allowed_tools,
    base_commit_sha
  )
VALUES
  (
    $conversation_id,
    $authn_user_id,
    $user_id,
    $message,
    $capability_jti,
    $capability_expires_at,
    $allowed_tools,
    $base_commit_sha
  )
RETURNING
  *;

-- BLOCK touch_conversation
UPDATE agent_conversations
SET
  updated_at = NOW()
WHERE
  id = $conversation_id;

-- BLOCK lock_conversation
SELECT
  id
FROM
  agent_conversations
WHERE
  id = $conversation_id
FOR UPDATE;

-- BLOCK next_event_sequence
SELECT
  COALESCE(MAX(sequence), 0) + 1
FROM
  agent_events
WHERE
  conversation_id = $conversation_id;

-- BLOCK insert_event
INSERT INTO
  agent_events (
    event_id,
    conversation_id,
    run_id,
    sequence,
    type,
    data,
    operation_id
  )
VALUES
  (
    $event_id,
    $conversation_id,
    $run_id,
    $sequence,
    $type,
    $data,
    $operation_id
  )
ON CONFLICT (event_id) DO NOTHING
RETURNING
  *;

-- BLOCK select_event_by_event_id
SELECT
  *
FROM
  agent_events
WHERE
  event_id = $event_id;

-- BLOCK list_events
SELECT
  *
FROM
  agent_events
WHERE
  conversation_id = $conversation_id
  AND sequence > $after_sequence
ORDER BY
  sequence
LIMIT
  $limit;

-- BLOCK select_active_run
SELECT
  *
FROM
  agent_runs
WHERE
  conversation_id = $conversation_id
  AND status IN ('pending', 'running', 'stopping')
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK request_stop
UPDATE agent_runs
SET
  status = 'stopping',
  stop_requested_at = COALESCE(stop_requested_at, NOW())
WHERE
  id = $run_id
  AND status IN ('pending', 'running')
RETURNING
  *;

-- BLOCK update_run_status
UPDATE agent_runs
SET
  status = $status::enum_agent_run_status,
  error = $error,
  claude_session_id = COALESCE($claude_session_id, claude_session_id),
  started_at = CASE
    WHEN $status::enum_agent_run_status = 'running' THEN COALESCE(started_at, NOW())
    ELSE started_at
  END,
  completed_at = CASE
    WHEN $status::enum_agent_run_status IN ('completed', 'failed', 'canceled') THEN COALESCE(completed_at, NOW())
    ELSE completed_at
  END
WHERE
  id = $run_id
RETURNING
  *;

-- BLOCK tombstone_conversation
UPDATE agent_conversations
SET
  deleted_at = NOW(),
  updated_at = NOW()
WHERE
  id = $conversation_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK tombstone_artifacts
UPDATE agent_artifacts
SET
  deleted_at = NOW(),
  metadata = '{}'::jsonb,
  content_type = NULL,
  sha256 = NULL,
  size_bytes = NULL,
  storage_key = CONCAT('deleted/', id, '/', gen_random_uuid())
WHERE
  conversation_id = $conversation_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK select_artifacts_for_update
SELECT
  *
FROM
  agent_artifacts
WHERE
  conversation_id = $conversation_id
  AND deleted_at IS NULL
ORDER BY
  id
FOR UPDATE;

-- BLOCK select_runs_for_update
SELECT
  *
FROM
  agent_runs
WHERE
  conversation_id = $conversation_id
ORDER BY
  id
FOR UPDATE;

-- BLOCK select_operations_for_update
SELECT
  agent_operations.*
FROM
  agent_operations
  JOIN agent_runs ON (agent_runs.id = agent_operations.run_id)
WHERE
  agent_runs.conversation_id = $conversation_id
ORDER BY
  agent_operations.id
FOR UPDATE OF
  agent_operations;

-- BLOCK redact_conversation_runs
UPDATE agent_runs
SET
  status = CASE
    WHEN status IN ('pending', 'running', 'stopping') THEN 'canceled'
    ELSE status
  END,
  completed_at = CASE
    WHEN status IN ('pending', 'running', 'stopping') THEN COALESCE(completed_at, NOW())
    ELSE completed_at
  END,
  message = '[deleted]',
  error = NULL,
  capability_jti = gen_random_uuid(),
  capability_expires_at = NOW(),
  allowed_tools = ARRAY[]::text[],
  claude_session_id = NULL
WHERE
  conversation_id = $conversation_id
RETURNING
  *;

-- BLOCK redact_conversation_events
UPDATE agent_events
SET
  data = '{}'::jsonb,
  operation_id = NULL
WHERE
  conversation_id = $conversation_id;

-- BLOCK redact_conversation_operations
UPDATE agent_operations
SET
  request = '{}'::jsonb,
  response = NULL,
  error = NULL,
  job_sequence_id = NULL
WHERE
  run_id IN (
    SELECT
      id
    FROM
      agent_runs
    WHERE
      conversation_id = $conversation_id
  )
RETURNING
  *;

-- BLOCK delete_conversation_draft_questions
DELETE FROM agent_draft_questions
WHERE
  conversation_id = $conversation_id;

-- BLOCK insert_operation
INSERT INTO
  agent_operations (
    operation_id,
    run_id,
    tool_name,
    status,
    request,
    expected_revision,
    started_at
  )
VALUES
  (
    $operation_id,
    $run_id,
    $tool_name,
    'running',
    $request,
    $expected_revision,
    NOW()
  )
ON CONFLICT (operation_id) DO NOTHING
RETURNING
  *;

-- BLOCK select_operation
SELECT
  *
FROM
  agent_operations
WHERE
  operation_id = $operation_id;

-- BLOCK complete_operation
UPDATE agent_operations
SET
  status = 'completed',
  response = $response,
  commit_sha = $commit_sha,
  completed_at = NOW()
WHERE
  operation_id = $operation_id
RETURNING
  *;

-- BLOCK fail_operation
UPDATE agent_operations
SET
  status = 'failed',
  error = $error,
  completed_at = NOW()
WHERE
  operation_id = $operation_id
RETURNING
  *;

-- BLOCK retry_operation
UPDATE agent_operations
SET
  status = 'running',
  error = NULL,
  completed_at = NULL,
  started_at = NOW()
WHERE
  id = $id
  AND status = 'failed'
RETURNING
  *;

-- BLOCK reclaim_operation
UPDATE agent_operations
SET
  status = 'running',
  error = NULL,
  completed_at = NULL,
  started_at = NOW()
WHERE
  id = $id
  AND (
    status = 'failed'
    OR (
      status = 'running'
      AND started_at < NOW() - INTERVAL '15 minutes'
    )
  )
RETURNING
  *;

-- BLOCK select_event_for_operation
SELECT
  *
FROM
  agent_events
WHERE
  operation_id = $operation_id
  AND type = $type
ORDER BY
  sequence DESC
LIMIT
  1;

-- BLOCK select_latest_checkpoint
SELECT
  *
FROM
  agent_events
WHERE
  run_id = $run_id
  AND type = 'checkpoint'
ORDER BY
  sequence DESC
LIMIT
  1;

-- BLOCK select_latest_conversation_checkpoint
SELECT
  *
FROM
  agent_events
WHERE
  conversation_id = $conversation_id
  AND type = 'checkpoint'
ORDER BY
  sequence DESC
LIMIT
  1;

-- BLOCK select_is_administrator
SELECT
  EXISTS (
    SELECT
      1
    FROM
      administrators
    WHERE
      user_id = $user_id
  );
