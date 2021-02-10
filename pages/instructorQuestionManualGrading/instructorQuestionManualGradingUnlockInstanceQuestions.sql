-- BLOCK unlock_locked_instance_questions
UPDATE submissions
SET manual_grading_user = NULL
FROM 
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN submissions as s ON (s.variant_id = v.id)
WHERE 
    iq.assessment_question_id = $assessment_question_id
    AND a.id = $assessment_id
    AND s.manual_grading_user IS NOT NULL
    AND s.graded_at IS NULL;
