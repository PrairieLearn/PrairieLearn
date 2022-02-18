ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS requires_manual_grading BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS assigned_grader BIGINT;

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
    requires_manual_grading = TRUE
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN ranked_submissions AS rs ON (TRUE)
WHERE
    aq.id = iq.assessment_question_id
    AND q.grading_method = 'Manual'
    AND rs.instance_question_id = iq.id
    AND rs.submission_row = 1
    AND rs.graded_at IS NULL;
