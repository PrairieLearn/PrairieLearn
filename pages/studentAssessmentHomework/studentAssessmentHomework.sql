-- BLOCK find_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
    LEFT JOIN (SELECT *
     FROM group_users AS gi
     JOIN groups AS gr ON gi.group_id = gr.id
     WHERE $user_id = gi.user_id AND gr.deleted_at IS NULL) AS gid ON TRUE
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ((ai.group_id = gid.group_id) OR (ai.user_id = $user_id));

-- BLOCK get_config_info
SELECT
    gc.student_authz_join, gc.student_authz_create, gc.student_authz_leave, gc.maximum, gc.minimum
FROM
    group_configs gc
WHERE
    gc.assessment_id = $assessment_id AND gc.deleted_at IS NULL;

-- BLOCK check_group_size
SELECT
    COUNT(gu) AS cur_size, AVG(gc.maximum) AS maximum
FROM
    groups gr
    JOIN group_configs gc ON gr.group_config_id = gc.id
    LEFT JOIN group_users gu ON gu.group_id = gr.id
WHERE
    gr.name = $group_name
    AND gr.join_code = $join_code
    AND gc.assessment_id = $assessment_id
    AND gr.deleted_at IS NULL
    AND gc.deleted_at IS NULL
GROUP BY
    gr.id;

-- BLOCK join_group
WITH log AS (
    INSERT INTO
        group_users (user_id, group_id)
    VALUES
        ($user_id, (SELECT id
                    FROM groups
                    WHERE name = $group_name AND join_code = $join_code AND deleted_at IS NULL))
    RETURNING group_id
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $user_id, $user_id, group_id, 'join'
FROM log;


-- BLOCK create_group
WITH log AS (
    INSERT INTO groups
        (name, group_config_id, course_instance_id)
    VALUES
        (
            $group_name,
            (SELECT id FROM group_configs WHERE assessment_id = $assessment_id AND deleted_at IS NULL),
            (SELECT course_instance_id FROM group_configs WHERE assessment_id = $assessment_id AND deleted_at IS NULL)
        )
    RETURNING id
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $user_id, $user_id, id, 'create'
FROM log;

-- BLOCK join_justcreated_group
WITH log AS (
    INSERT INTO group_users
        (group_id, user_id)
    VALUES
        (
            (SELECT id FROM groups WHERE name = $group_name AND deleted_at IS NULL),
            $user_id
        )
    RETURNING group_id
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $user_id, $user_id, group_id, 'join'
FROM log;

-- BLOCK get_group_info
SELECT
    gu.group_id, gr.name, gr.join_code, us.uid, gc.minimum, gc.maximum
FROM
    assessments ass
    JOIN group_configs gc ON gc.assessment_id = ass.id
    JOIN groups gr ON gr.group_config_id = gc.id
    JOIN group_users gu ON gu.group_id = gr.id
    JOIN group_users gu2 ON gu2.group_id = gu.group_id
    JOIN users us ON us.user_id = gu2.user_id
WHERE
    ass.id = $assessment_id
    AND gu.user_id = $user_id
    AND gr.deleted_at IS NULL
    AND gc.deleted_at IS NULL;

-- BLOCK leave_group
WITH log AS (
    DELETE FROM
        group_users
    WHERE
        user_id = $user_id
        AND group_id IN (SELECT gr.id
                        FROM assessments ass
                        JOIN group_configs gc ON gc.assessment_id = ass.id
                        JOIN groups gr ON gr.group_config_id = gc.id
                        WHERE ass.id = $assessment_id
                        AND gr.deleted_at IS NULL
                        AND gc.deleted_at IS NULL)
    RETURNING group_id
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $user_id, $user_id, group_id, 'leave'
FROM log;
