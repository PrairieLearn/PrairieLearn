-- BLOCK get_available_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.instance_question_id = $instance_question_id
    AND v.available
ORDER BY v.date DESC
LIMIT 1;

-- BLOCK make_variant
INSERT INTO variants AS v (date, instance_question_id, number, variant_seed, params, true_answer, options)
(
    SELECT
        current_timestamp,
        $instance_question_id,
        max(other_v.number) + 1,
        $variant_seed,
        $question_params,
        $true_answer,
        $options
    FROM
        variants AS other_v
    WHERE
        other_v.instance_question_id = $instance_question_id
)
RETURNING v.*;

-- BLOCK get_submission
SELECT
    s.*
FROM
    submissions AS s
WHERE
    s.variant_id = $variant_id
ORDER BY s.date DESC
LIMIT 1;

-- BLOCK get_variant
SELECT v.* FROM variants AS v WHERE v.id = $variant_id AND v.available;

-- BLOCK new_submission
INSERT INTO submissions AS s
    (date,               variant_id,  auth_user_id,  submitted_answer,
     type,  credit,  mode,  graded_at,  score,  correct,  feedback)
VALUES
    (current_timestamp, $variant_id, $auth_user_id, $submitted_answer,
    $type, $credit, $mode, $graded_at, $score, $correct, $feedback)
RETURNING s.*;

-- BLOCK update_variant
UPDATE variants AS v
SET
    available = $available
WHERE
    v.id = $variant_id
RETURNING v.*;

-- BLOCK update_instance_question
UPDATE instance_questions AS iq
SET
    points = $points,
    current_value = $current_value,
    number_attempts = $number_attempts
WHERE
    iq.id = $instance_question_id
RETURNING iq.*;

-- BLOCK update_test_instance
UPDATE test_instances AS ti
SET
    points = new_values.points,
    score_perc = new_values.score_perc
FROM
    test_points_homework($test_instance_id, $credit) AS new_values
WHERE
    ti.id = $test_instance_id
RETURNING ti.*;
