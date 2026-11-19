-- BLOCK select_variant_by_id
SELECT
  v.*
FROM
  variants AS v
WHERE
  v.id = $variant_id;

-- BLOCK select_and_lock_assessment_instance_or_variant
WITH
  variant_info AS (
    SELECT
      v.id AS variant_id,
      iq.assessment_instance_id
    FROM
      variants AS v
      LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    WHERE
      v.id = $variant_id
  ),
  lock_assessment_instance AS (
    SELECT
      ai.id
    FROM
      variant_info AS vi
      JOIN assessment_instances AS ai ON (vi.assessment_instance_id = ai.id)
    WHERE
      vi.assessment_instance_id IS NOT NULL
    FOR NO KEY UPDATE OF
      ai
  ),
  lock_variant AS (
    SELECT
      v.id
    FROM
      variant_info AS vi
      JOIN variants AS v ON (vi.variant_id = v.id)
    WHERE
      vi.assessment_instance_id IS NULL
    FOR NO KEY UPDATE OF
      v
  )
SELECT
  TRUE
FROM
  lock_assessment_instance
UNION ALL
SELECT
  TRUE
FROM
  lock_variant;

-- BLOCK reset_variants_for_assessment_question
UPDATE variants AS v
SET
  broken_at = CURRENT_TIMESTAMP,
  broken_by = $authn_user_id,
  modified_at = CURRENT_TIMESTAMP
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
WHERE
  v.instance_question_id = iq.id
  AND v.open = TRUE
  AND v.broken_at IS NULL
  AND aq.id = $unsafe_assessment_question_id
  AND aq.assessment_id = $assessment_id
RETURNING
  v.instance_question_id;

-- BLOCK reset_variants_for_instance_question
UPDATE variants AS v
SET
  broken_at = CURRENT_TIMESTAMP,
  broken_by = $authn_user_id,
  modified_at = CURRENT_TIMESTAMP
FROM
  instance_questions AS iq
WHERE
  v.instance_question_id = iq.id
  AND v.open = TRUE
  AND v.broken_at IS NULL
  AND iq.id = $unsafe_instance_question_id
  AND iq.assessment_instance_id = $assessment_instance_id
RETURNING
  v.instance_question_id;

-- BLOCK update_instance_question_status_after_reset
-- Saving an answer overwrites the question's status, so once that answer is
-- discarded the status is derived again from what was graded before it. The
-- rules mirror `computeInstanceQuestionPointsHomework`.
UPDATE instance_questions AS iq
SET
  status = CASE
  -- Staff can award points without recording a submission score. That
  -- grading had marked the question complete, and marking it unanswered
  -- would hide it from manual grading.
    WHEN iq.highest_submission_score IS NULL
    AND iq.last_grader IS NULL
    AND coalesce(iq.points, 0) = 0 THEN 'unanswered'
    WHEN iq.highest_submission_score IS NULL THEN 'complete'
    WHEN coalesce(iq.auto_points, 0) >= coalesce(aq.max_auto_points, 0)
    AND coalesce(aq.max_manual_points, 0) = 0 THEN 'complete'
    WHEN iq.highest_submission_score >= 1 THEN 'correct'
    ELSE 'incorrect'
  END::enum_instance_question_status,
  modified_at = now()
FROM
  assessment_questions AS aq
WHERE
  iq.id = ANY ($instance_question_ids::bigint[])
  AND aq.id = iq.assessment_question_id
  AND iq.status = 'saved'
  -- A question that is waiting for manual grading must stay answered so that
  -- it remains in the manual grading queue.
  AND (
    iq.highest_submission_score IS NOT NULL
    OR NOT iq.requires_manual_grading
  );

-- BLOCK select_variant_by_instance_question_id
WITH
  variant_max_submission_scores AS (
    SELECT
      v.id AS variant_id,
      max(s.score) AS max_submission_score
    FROM
      instance_questions AS iq
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
      iq.assessment_instance_id = $assessment_instance_id
      AND (
        $instance_question_id::bigint IS NULL
        OR iq.id = $instance_question_id
      )
      AND s.score IS NOT NULL
    GROUP BY
      v.id
  )
SELECT
  v.id,
  v.instance_question_id,
  v.open,
  COALESCE(vmss.max_submission_score, 0) AS max_submission_score
FROM
  instance_questions AS iq
  JOIN variants AS v ON (v.instance_question_id = iq.id)
  LEFT JOIN variant_max_submission_scores AS vmss ON (vmss.variant_id = v.id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND (
    $instance_question_id::bigint IS NULL
    OR iq.id = $instance_question_id
  )
  AND v.broken_at IS NULL
ORDER BY
  v.date;

-- BLOCK select_user_owns_variant
SELECT
  (
    CASE
      WHEN ai.team_id IS NOT NULL THEN EXISTS (
        SELECT
          1
        FROM
          team_users AS gu
        WHERE
          gu.team_id = ai.team_id
          AND gu.user_id = $user_id
      )
      ELSE (v.user_id = $user_id)
    END
  ) AS user_owns_variant
FROM
  variants AS v
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  v.id = $variant_id;
