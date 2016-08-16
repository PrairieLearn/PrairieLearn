-- BLOCK get_variant
-- find the most recent variant without a graded submission, if one exists
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.instance_question_id = $instance_question_id
    AND NOT EXISTS (SELECT * FROM submissions AS s WHERE s.variant_id = v.id AND s.score IS NULL)
ORDER BY v.date DESC
LIMIT 1;

-- BLOCK new_variant
INSERT INTO variants AS v (date, instance_question_id, number, variant_seed, params, true_answer, options)
(
    SELECT
        current_timestamp,
        $instance_question_id,
        max(other_v.number) + 1,
        $variant_seed,
        $params,
        $true_answer,
        $options
    FROM
        variants AS other_v
    WHERE
        other_v.instance_question_id = $instance_question_id
)
