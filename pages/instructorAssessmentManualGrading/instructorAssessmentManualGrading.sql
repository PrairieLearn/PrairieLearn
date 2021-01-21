-- BLOCK select_submissions_manual_grading
SELECT
    iq.*,
    s.graded_at,
    q.id AS question_id,
    aq.max_points
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN (
        -- We only want the last submission...
        SELECT * FROM submissions AS s
        ORDER BY s.date DESC, s.id DESC
        LIMIT 1
    ) s ON (s.variant_id = v.id)
WHERE
    ai.assessment_id = $assessment_id
    AND s.gradable IS TRUE
ORDER BY iq.id DESC, s.date DESC, s.id DESC
LIMIT 1;
