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
INSERT INTO assessment_instances AS ai (number, assessment_id, user_id)
(
    SELECT
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
RETURNING ai.id;
