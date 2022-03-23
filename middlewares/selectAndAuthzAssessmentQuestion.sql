-- BLOCK select_and_auth
WITH open_instances AS (
    SELECT
        COUNT(*) AS num_open_instances
    FROM
        assessments AS a
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    WHERE
        a.id = $assessment_id
        AND ai.open
)
SELECT
    to_jsonb(aq) AS assessment_question,
    to_jsonb(q) AS question,
    admin_assessment_question_number(aq.id) as number_in_alternative_group,
    to_jsonb(course_instances_select_graders($course_instance_id)) AS course_staff,
    COALESCE(oi.num_open_instances, 0) AS num_open_instances
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    LEFT JOIN open_instances AS oi ON (TRUE)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.id = $assessment_question_id;

