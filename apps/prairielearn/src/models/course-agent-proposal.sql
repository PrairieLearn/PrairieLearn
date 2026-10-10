-- BLOCK select_proposal
SELECT
  *
FROM
  course_agent_proposals
WHERE
  conversation_id = $conversation_id
  AND operation_id = $operation_id;

-- BLOCK select_proposals
SELECT
  *
FROM
  course_agent_proposals
WHERE
  conversation_id = $conversation_id
ORDER BY
  created_at,
  id;

-- BLOCK select_proposal_for_update
SELECT
  *
FROM
  course_agent_proposals
WHERE
  conversation_id = $conversation_id
  AND operation_id = $operation_id
FOR UPDATE;

-- BLOCK insert_proposal
INSERT INTO
  course_agent_proposals (conversation_id, operation_id, payload, digest)
VALUES
  (
    $conversation_id,
    $operation_id,
    $payload,
    $digest
  )
ON CONFLICT (operation_id) DO NOTHING
RETURNING
  *;

-- BLOCK update_proposal_preparation
UPDATE course_agent_proposals
SET
  payload = $payload,
  prepared = $prepared,
  error = $error
WHERE
  id = $id
  AND decision IS NULL
  AND outcome IS NULL;

-- BLOCK update_proposal_decision
UPDATE course_agent_proposals
SET
  decision = $decision
WHERE
  id = $id
  AND decision IS NULL
  AND digest = $digest
RETURNING
  *;

-- BLOCK update_proposal_progress
UPDATE course_agent_proposals
SET
  published_sha = COALESCE($published_sha, published_sha),
  sync_job_sequence_id = COALESCE($sync_job_sequence_id, sync_job_sequence_id),
  synced_sha = COALESCE($synced_sha, synced_sha),
  outcome = COALESCE($outcome, outcome),
  outcome_success = COALESCE($outcome_success, outcome_success),
  sync_validation_failed = COALESCE($sync_validation_failed, sync_validation_failed),
  sync_diagnostics = COALESCE($sync_diagnostics, sync_diagnostics),
  error = CASE
    WHEN $has_error THEN $error
    ELSE error
  END
WHERE
  id = $id
  AND outcome IS NULL
  AND (
    $published_sha::text IS NULL
    OR published_sha IS NULL
    OR published_sha = $published_sha
  )
RETURNING
  *;

-- BLOCK update_proposal_preparation_failure
UPDATE course_agent_proposals
SET
  prepared = FALSE,
  error = $error,
  outcome = $outcome,
  outcome_success = FALSE
WHERE
  id = $id
  AND decision IS NULL
  AND outcome IS NULL;

-- BLOCK reset_proposal_sync_receipt
UPDATE course_agent_proposals
SET
  sync_job_sequence_id = NULL,
  synced_sha = NULL
WHERE
  id = $id
  AND outcome IS NULL;
