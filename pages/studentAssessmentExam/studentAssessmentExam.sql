-- BLOCK select_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ai.user_id = $user_id;

-- BLOCK insert_assessment_instance
INSERT INTO assessment_instances AS ai
    (auth_user_id, assessment_id, user_id, mode, open, auto_close, tmp_upgraded_iq_status, date_limit, number)
SELECT
    $authn_user_id, $assessment_id, $user_id, $mode, TRUE, $auto_close, TRUE,
    CASE
        WHEN $time_limit_min::integer IS NULL THEN NULL
        ELSE $date::timestamptz + make_interval(mins => $time_limit_min::integer)
    END AS date_limit,
    CASE
        WHEN a.multiple_instance THEN (
            SELECT
                coalesce(max(ai.number) + 1, 1)
            FROM
                assessment_instances AS ai
            WHERE
                ai.assessment_id = $assessment_id
                AND ai.user_id = $user_id
        )
        ELSE 1
    END AS number
FROM
    assessments AS a
WHERE
    a.id = $assessment_id
RETURNING ai.id;

-- BLOCK select_new_questions
SELECT * FROM select_assessment_questions($assessment_id);

-- BLOCK make_instance_question
INSERT INTO instance_questions AS iq (authn_user_id, assessment_instance_id, assessment_question_id, points_list, current_value)
(
    SELECT
        $authn_user_id,
        $assessment_instance_id,
        aq.id,
        aq.points_list,
        COALESCE(aq.points_list[1], 0)
    FROM
        assessment_questions AS aq
    WHERE
        aq.id = $assessment_question_id
)
RETURNING iq.id;

-- BLOCK make_variant
INSERT INTO variants AS v (authn_user_id, instance_question_id, number, variant_seed, params, true_answer, options)
VALUES ($authn_user_id, $instance_question_id, 1, $variant_seed, $question_params, $true_answer, $options)
RETURNING v.id;

-- BLOCK set_max_points
UPDATE assessment_instances AS ai
SET
    max_points = (
        SELECT
            sum(iq.points_list[1])
        FROM
            instance_questions AS iq
        WHERE
            iq.assessment_instance_id = $assessment_instance_id
    )
WHERE
    ai.id = $assessment_instance_id;
