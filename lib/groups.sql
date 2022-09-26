-- BLOCK get_config_info
SELECT
    gc.*
FROM
    group_configs AS gc
WHERE
    gc.assessment_id = $assessment_id AND gc.deleted_at IS NULL;

-- BLOCK get_creator_role
SELECT
    gr.*
FROM
    group_roles AS gr
WHERE
    (gr.assessment_id = $assessment_id
    AND gr.can_assign_roles_at_start)
    OR
    (gr.role_name = 'No group roles')
ORDER BY gr.maximum
LIMIT 1

-- BLOCK create_group
WITH
create_group AS (
    INSERT INTO groups
        (name, group_config_id, course_instance_id)
    (
        SELECT
            $group_name, gc.id, gc.course_instance_id
        FROM
            group_configs AS gc
        WHERE
            gc.assessment_id = $assessment_id
            AND gc.deleted_at IS NULL
    )
    RETURNING id
),
create_log AS (
    INSERT INTO group_logs
        (authn_user_id, user_id, group_id, action)
    SELECT $authn_user_id, $user_id, cg.id, 'create' FROM create_group AS cg
),
join_group AS (
    INSERT INTO group_users
        (user_id, group_role_id, group_id)
    SELECT $user_id, $group_role_id, cg.id FROM create_group AS cg
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $authn_user_id, $user_id, cg.id, 'join' FROM create_group AS cg;

-- BLOCK get_group_info
SELECT
    DISTINCT gu.group_id, g.name, g.join_code, u.uid, gr.role_name, gc.minimum, gc.maximum,gc.student_authz_join, gc.student_authz_create, gc.student_authz_leave
FROM
    assessments AS a
    JOIN group_configs AS gc ON gc.assessment_id = a.id
    JOIN groups AS g ON g.group_config_id = gc.id
    JOIN group_users AS gu ON gu.group_id = g.id
    JOIN group_users AS gu2 ON gu2.group_id = gu.group_id
    JOIN users AS u ON u.user_id = gu2.user_id
    LEFT JOIN group_roles AS gr ON gr.id = gu2.group_role_id
WHERE
    a.id = $assessment_id
    AND gu.user_id = $user_id
    AND g.deleted_at IS NULL
    AND gc.deleted_at IS NULL;

-- BLOCK get_group_info_with_roles
SELECT
    DISTINCT gu.group_id, g.name, g.join_code, u.uid, gc.minimum, gc.maximum,gc.student_authz_join, gc.student_authz_create, gc.student_authz_leave,
    STRING_AGG(DISTINCT gr.role_name, ', ' ORDER BY gr.role_name) AS role_names
FROM
    assessments AS a
    JOIN group_configs AS gc ON gc.assessment_id = a.id
    JOIN groups AS g ON g.group_config_id = gc.id
    JOIN group_users AS gu ON gu.group_id = g.id
    JOIN group_users AS gu2 ON gu2.group_id = gu.group_id
    JOIN users AS u ON u.user_id = gu2.user_id
    LEFT JOIN group_roles AS gr ON gr.id = gu2.group_role_id
WHERE
    a.id = $assessment_id
    AND gu.user_id = $user_id
    AND g.deleted_at IS NULL
    AND gc.deleted_at IS NULL
GROUP BY
    gu.group_id, g.name, g.join_code, u.uid, gc.minimum, gc.maximum, gc.student_authz_join, gc.student_authz_create, gc.student_authz_leave;

-- BLOCK leave_group
WITH log AS (
    DELETE FROM
        group_users
    WHERE
        user_id = $user_id
        AND group_id IN (SELECT g.id
                        FROM assessments AS a
                        JOIN group_configs AS gc ON gc.assessment_id = a.id
                        JOIN groups AS g ON g.group_config_id = gc.id
                        WHERE a.id = $assessment_id
                        AND g.deleted_at IS NULL
                        AND gc.deleted_at IS NULL)
    RETURNING group_id
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $authn_user_id, $user_id, group_id, 'leave'
FROM log;

-- BLOCK get_group_roles
SELECT
    gr.*
FROM
    group_roles as gr
WHERE
    gr.assessment_id = $assessment_id;

-- BLOCK get_assessment_level_permissions
SELECT 
    gr.can_assign_roles_at_start, gr.can_assign_roles_during_assessment
FROM
    group_roles as gr JOIN group_users as gu ON gr.id = gu.group_role_id
WHERE
    gr.assessment_id = $assessment_id AND gu.user_id = $user_id;