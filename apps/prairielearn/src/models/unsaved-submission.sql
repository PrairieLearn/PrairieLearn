-- BLOCK upsert_unsaved_submission
INSERT INTO
  unsaved_submissions (
    variant_id,
    instance_question_id,
    user_id,
    credit,
    raw_submitted_answer,
    uuid
  )
SELECT
  v.id AS variant_id,
  iq.id AS instance_question_id,
  $user_id,
  $credit,
  $raw_submitted_answer,
  $uuid
FROM
  variants AS v
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  v.id = $variant_id
  AND iq.id = $instance_question_id
  AND v.open
  AND v.broken_at IS NULL
  AND iq.open
  AND ai.open
ON CONFLICT (instance_question_id, user_id) DO UPDATE
SET
  updated_at = CURRENT_TIMESTAMP,
  variant_id = EXCLUDED.variant_id,
  credit = EXCLUDED.credit,
  raw_submitted_answer = EXCLUDED.raw_submitted_answer,
  uuid = EXCLUDED.uuid
RETURNING
  id;

-- BLOCK delete_unsaved_submission
DELETE FROM unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id
  AND uuid = $uuid;

-- BLOCK delete_unsaved_submissions
DELETE FROM unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id;

-- BLOCK has_unsaved_submission
SELECT
  EXISTS (
    SELECT
      1
    FROM
      unsaved_submissions
    WHERE
      instance_question_id = $instance_question_id
      AND user_id = $user_id
      AND variant_id = $variant_id
  );

-- BLOCK select_optional_unsaved_submission
SELECT
  us.*
FROM
  unsaved_submissions AS us
WHERE
  us.instance_question_id = $instance_question_id
  AND us.user_id = $user_id
  AND us.variant_id = $variant_id;

-- BLOCK select_optional_unsaved_submission_updated_at
SELECT
  updated_at
FROM
  unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id
  AND variant_id = $variant_id;
