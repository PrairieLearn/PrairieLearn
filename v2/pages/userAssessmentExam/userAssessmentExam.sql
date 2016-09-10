-- BLOCK get_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ai.user_id = $user_id;

-- BLOCK make_assessment_instance
INSERT INTO assessment_instances AS ai (number, assessment_id, user_id, open)
VALUES (1, $assessment_id, $user_id, TRUE)
RETURNING ai.id;

-- BLOCK get_work_list
SELECT
    aq.id AS assessment_question_id,
    to_jsonb(q) AS question
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL;

-- BLOCK make_instance_question
INSERT INTO instance_questions AS iq (assessment_instance_id, assessment_question_id, points_list, current_value)
(
    SELECT
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
INSERT INTO variants AS v (instance_question_id, number, variant_seed, params, true_answer, options)
VALUES ($instance_question_id, 1, $variant_seed, $question_params, $true_answer, $options)
RETURNING v.id;
