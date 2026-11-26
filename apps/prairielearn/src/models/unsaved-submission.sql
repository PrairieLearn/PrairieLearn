-- BLOCK lock_unsaved_submission_state
INSERT INTO
  unsaved_submission_states (instance_question_id, user_id)
VALUES
  ($instance_question_id, $user_id)
ON CONFLICT (instance_question_id, user_id) DO UPDATE
SET
  generation = unsaved_submission_states.generation;

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
  JOIN unsaved_submission_states AS uss ON (
    uss.instance_question_id = iq.id
    AND uss.user_id = $user_id
  )
WHERE
  v.id = $variant_id
  AND iq.id = $instance_question_id
  AND v.open
  AND v.broken_at IS NULL
  AND iq.open
  AND ai.open
  AND uss.generation = $generation
  AND NOT ($uuid = ANY (uss.discarded_uuids))
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
WITH
  revoked AS (
    UPDATE unsaved_submission_states
    SET
      discarded_uuids = CASE
        WHEN $uuid = ANY (discarded_uuids) THEN discarded_uuids
        ELSE array_append(discarded_uuids, $uuid)
      END
    WHERE
      instance_question_id = $instance_question_id
      AND user_id = $user_id
      AND generation = $generation
    RETURNING
      instance_question_id,
      user_id
  )
DELETE FROM unsaved_submissions AS us USING revoked
WHERE
  us.instance_question_id = revoked.instance_question_id
  AND us.user_id = revoked.user_id
  AND us.uuid = $uuid;

-- BLOCK delete_unsaved_submissions
WITH
  affected_users AS (
    SELECT
      $user_id::bigint AS user_id
    WHERE
      $user_id::bigint IS NOT NULL
    UNION
    SELECT
      tu.user_id
    FROM
      instance_questions AS iq
      JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      JOIN team_users AS tu ON (tu.team_id = ai.team_id)
    WHERE
      iq.id = $instance_question_id
      AND $user_id::bigint IS NULL
    UNION
    SELECT
      uss.user_id
    FROM
      unsaved_submission_states AS uss
    WHERE
      uss.instance_question_id = $instance_question_id
      AND $user_id::bigint IS NULL
  ),
  advanced AS (
    INSERT INTO
      unsaved_submission_states (instance_question_id, user_id, generation)
    SELECT
      $instance_question_id,
      user_id,
      1
    FROM
      affected_users
    ORDER BY
      user_id
    ON CONFLICT (instance_question_id, user_id) DO UPDATE
    SET
      generation = unsaved_submission_states.generation + 1,
      discarded_uuids = '{}'
    RETURNING
      instance_question_id,
      user_id
  )
DELETE FROM unsaved_submissions AS us USING advanced
WHERE
  us.instance_question_id = advanced.instance_question_id
  AND us.user_id = advanced.user_id;

-- BLOCK select_unsaved_submission_generation
SELECT
  COALESCE(
    (
      SELECT
        generation
      FROM
        unsaved_submission_states
      WHERE
        instance_question_id = $instance_question_id
        AND user_id = $user_id
    ),
    0
  );

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
