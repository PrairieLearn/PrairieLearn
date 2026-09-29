-- BLOCK select
SELECT
  *
FROM
  course_agent_proposals
WHERE
  conversation_id = $conversation_id
  AND operation_id = $operation_id;

-- BLOCK list
SELECT
  *
FROM
  course_agent_proposals
WHERE
  conversation_id = $conversation_id
ORDER BY
  sequence;

-- BLOCK insert
INSERT INTO
  course_agent_proposals (
    conversation_id,
    operation_id,
    sequence,
    payload,
    digest
  )
VALUES
  (
    $conversation_id,
    $operation_id,
    $sequence,
    $payload,
    $digest
  )
ON CONFLICT (operation_id) DO NOTHING
RETURNING
  *;

-- BLOCK prepare
UPDATE course_agent_proposals
SET
  payload = $payload,
  prepared = $prepared,
  error = $error
WHERE
  id = $id
  AND decision IS NULL;

-- BLOCK decide
UPDATE course_agent_proposals
SET
  decision = $decision
WHERE
  id = $id
  AND decision IS NULL
RETURNING
  *;

-- BLOCK progress
UPDATE course_agent_proposals
SET
  published_sha = COALESCE($published_sha, published_sha),
  sync_job_sequence_id = COALESCE($sync_job_sequence_id, sync_job_sequence_id),
  synced_sha = COALESCE($synced_sha, synced_sha),
  outcome = COALESCE($outcome, outcome),
  delivered = COALESCE($delivered, delivered),
  error = $error
WHERE
  id = $id;

-- BLOCK job_status
SELECT
  status
FROM
  job_sequences
WHERE
  id = $id;
