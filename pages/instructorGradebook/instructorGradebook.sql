-- BLOCK course_assessments
SELECT
    a.id AS assessment_id,
    a.number AS assessment_number,
    aset.number AS assessment_set_number,aset.color,
    (aset.abbreviation || a.number) AS label
FROM 
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE 
    a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id
ORDER BY (aset.number, a.order_by, a.id);

-- BLOCK user_scores
WITH
course_assessments AS (
    SELECT 
        a.id,
        a.order_by AS assessment_order_by,
        aset.number AS assessment_set_number
    FROM 
        assessments AS a
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE 
        a.deleted_at IS NULL 
        AND a.course_instance_id = $course_instance_id
),
course_scores AS (
    SELECT DISTINCT ON (ai.user_id, ai.group_id, a.id)
        ai.user_id, 
        a.id AS assessment_id, 
        ai.score_perc, 
        ai.id AS assessment_instance_id, 
        ai.group_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        a.course_instance_id = $course_instance_id
    ORDER BY
        ai.user_id, ai.group_id, a.id, ai.score_perc DESC, ai.id
),
user_ids AS (
    (SELECT DISTINCT user_id FROM course_scores)
    UNION
    (SELECT user_id FROM enrollments WHERE course_instance_id = $course_instance_id)
),
course_users AS (
    SELECT u.user_id,u.uid,u.uin,u.name AS user_name,coalesce(e.role, 'None'::enum_role) AS role
    FROM
        user_ids
        JOIN users AS u ON (u.user_id = user_ids.user_id)
        LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = $course_instance_id)
),
scores AS (
    SELECT u.user_id,u.uid,u.uin,u.user_name,u.role,
        a.id AS assessment_id,a.assessment_order_by,a.assessment_set_number,
        s.score_perc, s.assessment_instance_id
    FROM
        course_users AS u
        CROSS JOIN course_assessments AS a
        LEFT JOIN group_users AS gu ON (u.user_id = gu.user_id)
        LEFT JOIN groups AS gr ON (gr.id = gu.group_id)
        LEFT JOIN course_scores AS s ON (((s.user_id = u.user_id) OR (s.group_id = gu.group_id)) AND s.assessment_id = a.id)
     WHERE 
         gr.deleted_at IS NULL
)
SELECT user_id,uid,uin,user_name,role,
    ARRAY_AGG(
        json_build_object(
            'score_perc', score_perc,
            'assessment_instance_id', assessment_instance_id
        )
        ORDER BY (assessment_set_number, assessment_order_by, assessment_id)
    ) AS scores
FROM scores
GROUP BY user_id,uid,uin,user_name,role
ORDER BY role DESC, uid;
