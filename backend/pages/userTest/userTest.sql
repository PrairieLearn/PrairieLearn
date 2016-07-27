-- BLOCK find_single_test_instance
SELECT
    ti.*
FROM
    test_instances AS ti
WHERE
    ti.test_id = $test_id
    AND ti.number = 1
    AND ti.user_id = $user_id;

-- BLOCK new_test_instance
WITH
    max_existing_number AS (
        SELECT
            COALESCE(max(ti.number), 0) as val
        FROM
            test_instances AS ti
        WHERE
            ti.test_id = $test_id
            AND ti_user_id = $user_id
    )
INSERT INTO test_instances (date, number, test_id, user_id) AS ti
(
    SELECT
        current_timestamp, 
        CASE
            WHEN t.multiple_instance THEN max_existing_number.val + 1
            ELSE 1
        END,
        val.test_id,
        val.user_id
    FROM
        tests AS t,
        max_existing_number,
        (VALUES ($test_id, $user_id)) AS val (test_id, user_id)
    WHERE
        t.test_id = $test_id
)
RETURNING ti.*;

-- BLOCK new_question_instance
INSERT INTO question_instances
    (date, test_instance_id, user_id, test_question_id, number, variant_seed, params, true_answer, options)
VALUES
    (current_timestamp, $test_instance_id, $user_id, $test_question_id, $number, $variant_seed, $params, $true_answer, $options);
