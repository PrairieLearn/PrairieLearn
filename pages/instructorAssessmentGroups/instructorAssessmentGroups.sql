--BLOCK config_info
SELECT 
    id, course_instance_id, name, minimum, maximum, student_authz_join, student_authz_create, student_authz_leave
FROM 
    group_configs
WHERE 
    assessment_id = $assessment_id AND deleted_at IS NULL;

-- BLOCK assessment_list
SELECT 
    id, tid, title
FROM 
    assessments
WHERE 
    group_work 
    AND id != $assessment_id 
    AND course_instance_id = $course_instance_id
ORDER BY tid;

-- BLOCK select_group_users
SELECT
    gr.id AS gid,
    gr.name AS name,
    COUNT(u.uid) AS size,
    array_agg(u.uid) AS uid_list
FROM
    groups AS gr
    LEFT JOIN group_users AS gu ON gu.group_id = gr.id
    LEFT JOIN users AS u ON u.user_id = gu.user_id
WHERE
    gr.deleted_at IS NULL
    AND gr.group_config_id = $group_config_id
GROUP BY
    gr.id
ORDER BY
    gr.id;

-- BLOCK select_not_in_group
SELECT
    u.uid
FROM
    groups AS gr
    JOIN group_users AS gu ON gu.group_id = gr.id AND gr.group_config_id = $group_config_id AND gr.deleted_at IS NULL
    RIGHT JOIN enrollments AS e ON e.user_id = gu.user_id
    JOIN users AS u ON u.user_id = e.user_id
WHERE
    gr.id IS NULL
    AND e.course_instance_id = $course_instance_id
    AND e.role = 'Student'
ORDER BY u.uid;

--BLOCK config_group
UPDATE 
    group_configs
SET
    minimum = $minsize,
    maximum = $maxsize,
    student_authz_join = $joincheck,
    student_authz_create = $createcheck,
    student_authz_leave = $leavecheck
WHERE
    assessment_id = $assessment_id AND deleted_at IS NULL;

--BLOCK verify_group
SELECT g.name
FROM
    group_configs AS gc
    JOIN groups AS g ON gc.id = g.group_config_id
WHERE
    gc.assessment_id = $assessment_id
    AND g.id = $gid
    AND g.deleted_at IS NULL;
