-- BLOCK select_submissions_manual_grading
SELECT
    s.*
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN (
        -- We only want the last submission...
        SELECT * FROM submissions AS s
        ORDER BY s.date DESC, s.id DESC
        LIMIT 1
    ) s ON (s.variant_id = v.id)
WHERE
    -- Front end can filter out by the manual grading date
    ai.assessment_id = $assessment_id
ORDER BY iq.id DESC, s.date DESC, s.id DESC
LIMIT 1;
