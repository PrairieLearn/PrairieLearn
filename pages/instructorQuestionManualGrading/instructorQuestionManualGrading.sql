-- BLOCK instance_question_abort_manual_grading
WITH iq_with_last_submission AS (
    SELECT iq.*, s.graded_at
    FROM
        instance_questions AS iq
        JOIN variants AS v ON (iq.id = v.instance_question_id)
        JOIN submissions AS s ON (v.id = s.variant_id)
    WHERE iq.id = $instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1
)
UPDATE
    instance_questions AS iq
SET
    manual_grading_user = NULL
FROM
    iq_with_last_submission AS iqwls
WHERE
    -- NOTE: Do not remove user from already graded items
    iq.id = $instance_question_id
    AND iqwls.graded_at IS NULL;

