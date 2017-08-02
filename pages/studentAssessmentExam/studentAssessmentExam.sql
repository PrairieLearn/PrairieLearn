-- BLOCK select_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ai.user_id = $user_id;

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
