-- BLOCK find_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
    LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.deleted_at IS NULL)
    LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ((gu.user_id = $user_id) OR (ai.user_id = $user_id));

-- BLOCK get_config_info
SELECT
    gc.*
FROM
    group_configs gc
WHERE
    gc.assessment_id = $assessment_id AND gc.deleted_at IS NULL;

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
        (user_id, group_id)
    SELECT $user_id, cg.id FROM create_group AS cg
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $authn_user_id, $user_id, cg.id, 'join' FROM create_group AS cg;

-- BLOCK get_group_info
SELECT
    /* Each row is a student in a group */
    gu.group_id, g.name, g.join_code, u.uid, gc.minimum, gc.maximum, gu.pogil_role /* Needs to also select gu.group_role */
FROM
    assessments AS a
    JOIN group_configs AS gc ON gc.assessment_id = a.id
    JOIN groups AS g ON g.group_config_id = gc.id
    JOIN group_users AS gu ON gu.group_id = g.id
    JOIN group_users AS gu2 ON gu2.group_id = gu.group_id
    JOIN users AS u ON u.user_id = gu2.user_id
WHERE
    a.id = $assessment_id
    AND gu.user_id = $user_id
    AND g.deleted_at IS NULL
    AND gc.deleted_at IS NULL;

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
