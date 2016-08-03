-- BLOCK update
WITH new_instance_questions AS (
    SELECT
        tq.number AS order_by,
        0 AS points,
        tq.init_points AS current_value,
        0 AS number_attempts,
        $test_instance_id::integer AS test_instance_id,
        tq.id AS test_question_id
    FROM
        test_questions AS tq
    WHERE
        tq.test_id = $test_id
        AND tq.deleted_at IS NULL
)
INSERT INTO instance_questions (order_by, points, current_value, number_attempts, test_instance_id, test_question_id)
(SELECT * FROM new_instance_questions)
ON CONFLICT (test_question_id, test_instance_id) DO NOTHING;

-- BLOCK get_questions
SELECT
    iq.*,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY iq.order_by, iq.id) IS NULL) AS start_new_zone,
    z.title AS zone_title,
    q.title AS question_title
FROM
    instance_questions AS iq
    JOIN test_questions AS tq ON (tq.id = iq.test_question_id)
    JOIN zones AS z ON (z.id = tq.zone_id)
    JOIN questions AS q ON (q.id = tq.question_id)
WHERE
    iq.test_instance_id = $test_instance_id
    AND tq.deleted_at IS NULL
ORDER BY (z.number, iq.order_by, iq.id);

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
