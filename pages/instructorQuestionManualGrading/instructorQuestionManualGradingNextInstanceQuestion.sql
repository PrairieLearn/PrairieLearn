-- BLOCK get_unmarked_instance_questions
SELECT iq.* FROM instance_questions AS iq
    LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
    LEFT JOIN submissions AS s ON (s.variant_id = v.id)
WHERE iq.assessment_question_id = 50 AND s.graded_at IS NULL;
