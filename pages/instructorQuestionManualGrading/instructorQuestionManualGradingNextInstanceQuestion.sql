-- BLOCK get_next_ungraded_instance_question
WITH to_grade AS (
    SELECT *, (lead(id) OVER (ORDER BY user_or_group_name DESC) IS NOT DISTINCT FROM $prior_instance_question_id) AS is_next
    FROM (
        SELECT DISTINCT ON (iq.id)
            iq.*,
            s.graded_at,
            ai.id AS assessment_instance_id,
            COALESCE(g.name, u.name) AS user_or_group_name
        FROM
            instance_questions AS iq
            JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
            LEFT JOIN users u ON (u.user_id = ai.user_id)
            LEFT JOIN groups g ON (g.id = ai.group_id)
        WHERE
            ai.assessment_id = $assessment_id
            AND iq.assessment_question_id = $assessment_question_id
        ORDER BY iq.id DESC, s.date DESC, s.id DESC) AS submission_info
    WHERE submission_info.graded_at IS NULL OR submission_info.id = $prior_instance_question_id
)
SELECT * FROM to_grade
WHERE graded_at IS NULL
ORDER BY is_next DESC -- choose next question if there is one, otherwise choose any question
LIMIT 1;

