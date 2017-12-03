WITH
fixed_submissions AS (
    UPDATE submissions AS s
    SET score = 0
    WHERE score = 'NaN'
    RETURNING s.*
),
instance_questions_needing_fixing AS (
    SELECT DISTINCT iq.id
    FROM
        fixed_submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
)
SELECT instance_questions_calculate_stats(iq.id)
FROM instance_questions_needing_fixing AS iq;
