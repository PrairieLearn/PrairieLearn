-- This migration should ideally be run as close as possible to when
-- the code is deployed in production.
-- Any submissions for manually graded questions submitted after this
-- migration runs and before the code is updated (particularly sproc
-- submissions_insert) will not be tagged for manual grading when it
-- should.
-- Any submissions graded after this migration runs and before the
-- code is updated (particularly sproc
-- instance_questions_update_score) will still be tagged for manual
-- grading when it shouldn't.
WITH
  ranked_submissions AS (
    SELECT DISTINCT
      ON (iq.id) iq.id AS instance_question_id,
      s.graded_at
    FROM
      submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
      JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
      JOIN questions AS q ON (q.id = v.question_id)
    WHERE
      q.grading_method = 'Manual'
      AND iq.modified_at > now() - interval '3 months'
    ORDER BY
      iq.id,
      s.date DESC,
      s.id DESC
  )
UPDATE instance_questions AS iq
SET
  requires_manual_grading = (rs.graded_at IS NULL)
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN ranked_submissions AS rs ON (TRUE)
WHERE
  aq.id = iq.assessment_question_id
  AND q.grading_method = 'Manual'
  AND rs.instance_question_id = iq.id
  AND (
    iq.requires_manual_grading
    OR rs.graded_at IS NULL
  );
