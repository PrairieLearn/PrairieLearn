-- BLOCK find_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ai.user_id = $user_id;

-- BLOCK new_assessment_instance
WITH
    max_existing_number AS (
        SELECT
            COALESCE(max(ai.number), 0) AS val
        FROM
            assessment_instances AS ai
        WHERE
            ai.assessment_id = $assessment_id
            AND ai.user_id = $user_id
    )
INSERT INTO assessment_instances AS ai (date, number, assessment_id, user_id)
(
    SELECT
        current_timestamp, 
        CASE
            WHEN a.multiple_instance THEN max_existing_number.val + 1
            ELSE 1
        END,
        val.assessment_id,
        val.user_id
    FROM
        assessments AS a,
        max_existing_number,
        (VALUES ($assessment_id, $user_id)) AS val (assessment_id, user_id)
    WHERE
        a.id = $assessment_id
)
RETURNING ai.*;

-- BLOCK new_question_instance
INSERT INTO question_instances
    (date, assessment_instance_id, user_id, assessment_question_id, number, variant_seed, params, true_answer, options)
VALUES
    (current_timestamp, $assessment_instance_id, $user_id, $assessment_question_id, $number, $variant_seed, $params, $true_answer, $options);
