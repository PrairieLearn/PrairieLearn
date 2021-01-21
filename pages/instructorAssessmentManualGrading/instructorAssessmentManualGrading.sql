-- BLOCK select_instance_questions_manual_grading
SELECT
    *
FROM
    assessment_questions AS aq
    JOIN instance_questions AS iq ON (aq.id = iq.assessment_question_id)
-- Filter out only for questions marked for grading
WHERE
    aq.assessment_id = $assessment_id
    -- AND (js.type = 'regrade_assessment' OR js.type = 'regrade_assessment_instance')
ORDER BY
    aq.assessment_question_id, iq.instance_question_id;
