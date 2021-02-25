-- BLOCK unlock_locked_instance_questions
UPDATE instance_questions
SET manual_grading_user = NULL
FROM 
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
WHERE 
    iq.assessment_question_id = $assessment_question_id
    AND a.id = $assessment_id
    AND iq.manual_grading_user IS NOT NULL
    AND s.graded_at IS NULL;
