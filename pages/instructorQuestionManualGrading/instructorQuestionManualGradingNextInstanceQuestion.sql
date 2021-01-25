-- BLOCK get_next_unmarked_instance_question
SELECT iq.*
    FROM instance_questions AS iq
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN (
        -- We only want the LAST submission that is created by each user
        SELECT DISTINCT ON (s.auth_user_id) * FROM submissions AS s
        ORDER BY s.auth_user_id, s.date DESC, s.id DESC
    ) s ON (s.variant_id = v.id)
WHERE iq.assessment_question_id = $assessment_question_id AND s.graded_at IS NULL;