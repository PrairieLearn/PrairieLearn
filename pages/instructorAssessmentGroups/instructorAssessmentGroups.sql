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
SELECT DISTINCT
    u.uid,
    gr.name,
    gu.group_id AS GID,
    e.role
FROM
    groups AS gr
    JOIN group_users AS gu ON gu.group_id = gr.id AND gr.deleted_at IS NULL
    RIGHT JOIN enrollments AS e ON e.user_id = gu.user_id
    JOIN users AS u ON u.user_id = e.user_id
WHERE
    gr.group_config_id = $group_config_id
    OR gr.group_config_id IS NULL
    AND e.course_instance_id = $course_instance_id
ORDER BY GID

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
