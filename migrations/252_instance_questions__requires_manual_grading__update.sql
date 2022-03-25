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

WITH ranked_submissions AS (
    SELECT
        v.instance_question_id,
        s.*,
        ROW_NUMBER() OVER (PARTITION BY v.instance_question_id ORDER BY s.date DESC) AS submission_row
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
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
    AND rs.submission_row = 1
    AND (iq.requires_manual_grading OR rs.graded_at IS NULL);
