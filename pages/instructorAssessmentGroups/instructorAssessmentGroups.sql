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
    g.id AS group_id,
    g.name AS name,
    COUNT(u.uid) AS size,
    array_agg(u.uid) AS uid_list
FROM
    groups AS g
    LEFT JOIN group_users AS gu ON gu.group_id = g.id
    LEFT JOIN users AS u ON u.user_id = gu.user_id
WHERE
    g.deleted_at IS NULL
    AND g.group_config_id = $group_config_id
GROUP BY
    g.id
ORDER BY
    g.id;

-- BLOCK select_not_in_group
SELECT
    u.uid
FROM
    groups AS g
    JOIN group_users AS gu ON gu.group_id = g.id AND g.group_config_id = $group_config_id AND g.deleted_at IS NULL
    RIGHT JOIN enrollments AS e ON e.user_id = gu.user_id
    JOIN users AS u ON u.user_id = e.user_id
WHERE
    g.id IS NULL
    AND e.course_instance_id = $course_instance_id
    AND NOT users_is_instructor_in_course(e.user_id, e.course_instance_id)
ORDER BY u.uid;
