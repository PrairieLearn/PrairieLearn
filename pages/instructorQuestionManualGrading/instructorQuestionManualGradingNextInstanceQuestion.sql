-- BLOCK get_next_unmarked_instance_question
SELECT iq.*
FROM 
    instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN assessments AS a ON (a.id = aq.assessment_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN (
            -- We only want the LAST submissions that are created by each user to join on all
            -- instance questions under assessment question
            SELECT DISTINCT ON (s.auth_user_id) * FROM submissions AS s
            WHERE s.graded_at IS NULL
            ORDER BY s.auth_user_id, s.date DESC, s.id DESC
        ) s ON (s.variant_id = v.id)
WHERE 
    iq.assessment_question_id = $assessment_question_id
    AND a.id = $assessment_id
LIMIT 1;
