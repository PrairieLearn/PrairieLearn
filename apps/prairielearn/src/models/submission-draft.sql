-- BLOCK upsert_submission_draft
INSERT INTO
  submission_drafts (
    variant_id,
    user_id,
    client_id,
    revision,
    raw_submitted_answer,
    is_cleared
  )
VALUES
  (
    $variant_id,
    $user_id,
    $client_id,
    $revision,
    $raw_submitted_answer,
    $is_cleared
  )
ON CONFLICT (variant_id, user_id) DO UPDATE
SET
  client_id = EXCLUDED.client_id,
  revision = EXCLUDED.revision,
  raw_submitted_answer = EXCLUDED.raw_submitted_answer,
  is_cleared = EXCLUDED.is_cleared,
  updated_at = now()
WHERE
  (
    NOT EXCLUDED.is_cleared
    OR submission_drafts.client_id = EXCLUDED.client_id
  )
  AND (
    submission_drafts.client_id != EXCLUDED.client_id
    OR submission_drafts.revision < EXCLUDED.revision
  );

-- BLOCK select_submission_draft
SELECT
  *
FROM
  submission_drafts
WHERE
  variant_id = $variant_id
  AND user_id = $user_id
  AND NOT is_cleared;

-- BLOCK delete_submission_draft
DELETE FROM submission_drafts
WHERE
  variant_id = $variant_id
  AND user_id = $user_id;

-- BLOCK delete_submission_drafts_for_variant
DELETE FROM submission_drafts
WHERE
  variant_id = $variant_id;

-- BLOCK delete_expired_submission_drafts
DELETE FROM submission_drafts
WHERE
  updated_at < now() - make_interval(secs => $retention_period_sec);
