-- BLOCK select_and_auth
WITH course_staff AS (
    SELECT
        jsonb_agg(jsonb_build_object(
            'user_id', u.user_id,
            'uid', u.uid,
            'name', u.name) ORDER BY u.uid, u.name, u.user_id) AS course_staff
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN course_instance_permissions AS cip ON (cip.course_instance_id = ci.id)
        JOIN course_permissions AS cp ON (cp.id = cip.course_permission_id)
        JOIN users AS u ON (u.user_id = cp.user_id)
    WHERE
        a.id = $assessment_id
        AND cip.course_instance_role >= 'Student Data Editor'
),
open_instances AS (
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
    COALESCE(cs.course_staff, '[]'::jsonb) AS course_staff,
    COALESCE(oi.num_open_instances, 0) AS num_open_instances
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    LEFT JOIN course_staff AS cs ON (TRUE)
    LEFT JOIN open_instances AS oi ON (TRUE)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.id = $assessment_question_id;

