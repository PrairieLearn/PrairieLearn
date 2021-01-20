-- BLOCK get_next_unmarked_instance_question
SELECT s.*
    FROM instance_questions AS iq
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN (
        -- We only want the last submission...
        SELECT * FROM submissions AS s
        ORDER BY s.date DESC, s.id DESC
        LIMIT 1
    ) s ON (s.variant_id = v.id)
    -- ... but ONLY IF the last submission 'graded_at' is null (has not been graded)
WHERE iq.assessment_question_id = $assessment_question_id AND s.graded_at IS NULL
ORDER BY s.date DESC, s.id DESC
LIMIT 1;