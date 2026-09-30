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

-- BLOCK select_submission_drafts_for_assessment_instance
SELECT
  to_jsonb(sd.*) AS draft,
  to_jsonb(v.*) AS variant,
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(q.*) AS question,
  u.uid AS author_uid,
  qo.question_number
FROM
  submission_drafts AS sd
  JOIN variants AS v ON (v.id = sd.variant_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN users AS u ON (u.id = sd.user_id)
  JOIN question_order (ai.id) AS qo ON (qo.instance_question_id = iq.id)
WHERE
  ai.id = $assessment_instance_id
  AND NOT sd.is_cleared
  AND v.open
  AND v.broken_at IS NULL
  AND iq.open
  AND q.type = 'Freeform'
  AND qo.question_access_mode = 'default'
  AND (
    sd.user_id = ai.user_id
    OR EXISTS (
      SELECT
        1
      FROM
        team_users AS tu
      WHERE
        tu.team_id = ai.team_id
        AND tu.user_id = sd.user_id
    )
  )
ORDER BY
  qo.row_order,
  sd.updated_at DESC;

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
