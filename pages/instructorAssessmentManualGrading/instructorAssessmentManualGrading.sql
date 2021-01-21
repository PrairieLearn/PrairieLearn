-- BLOCK select_submissions_manual_grading
SELECT
    s.*
FROM
    assessment_questions AS aq
    JOIN instance_questions AS iq ON (aq.id = iq.assessment_question_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN (
        -- We only want the last submission...
        SELECT * FROM submissions AS s
        ORDER BY s.date DESC, s.id DESC
        LIMIT 1
    ) s ON (s.variant_id = v.id)
-- Filter out only for questions marked for grading
WHERE
    -- Front end can filter out by the manual grading date
    aq.assessment_id = $assessment_id
ORDER BY aq.assessment_id DESC, s.date DESC, s.id DESC
LIMIT 1;
