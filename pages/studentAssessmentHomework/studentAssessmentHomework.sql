-- BLOCK find_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai,
    (SELECT *
     FROM group_users AS gi
     JOIN groups AS gr ON gi.group_id = gr.id
     WHERE $user_id = gi.user_id AND gr.deleted_at IS NULL) AS gid
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ((ai.group_id = gid.group_id) OR (ai.user_id = $user_id));

-- BLOCK get_config_info
SELECT gc.student_authz_join, gc.student_authz_create, gc.student_authz_quit
FROM group_configs gc
WHERE gc.assessment_id = $assessment_id AND gc.deleted_at IS NULL;

-- BLOCK check_group_size
SELECT gc.maximum, gu.user_id, gu.group_id, gc.assessment_id
FROM groups gr
JOIN group_configs gc ON gr.group_config_id = gc.id
JOIN group_users gu ON gu.group_id = gr.id
WHERE gr.id = $group_id AND gc.assessment_id = $assessment_id AND gr.deleted_at IS NULL AND gc.deleted_at IS NULL;

-- BLOCK join_group
INSERT INTO group_users (group_id, user_id)
    VALUES ($group_id, $user_id);

-- BLOCK create_group
INSERT INTO groups (name, group_config_id, course_instance_id)
        VALUES (
            $group_name, 
            (SELECT id FROM group_configs WHERE assessment_id = $assessment_id AND deleted_at IS NULL),
            (SELECT course_instance_id FROM group_configs WHERE assessment_id = $assessment_id AND deleted_at IS NULL)
            );

-- BLOCK join_justcreated_group
INSERT INTO group_users (group_id, user_id)
    VALUES(
        (SELECT id FROM groups WHERE name = $group_name AND deleted_at IS NULL),
        $user_id);

-- BLOCK get_group_info
SELECT gu.group_id, gr.name, us.uid, gc.minimum, gc.maximum
FROM assessments ass
JOIN group_configs gc ON gc.assessment_id = ass.id
JOIN groups gr ON gr.group_config_id = gc.id
JOIN group_users gu ON gu.group_id = gr.id
JOIN group_users gu2 ON gu2.group_id = gu.group_id
JOIN users us ON us.user_id = gu2.user_id
WHERE ass.id = $assessment_id AND gu.user_id = $user_id AND gr.deleted_at IS NULL AND gc.deleted_at IS NULL;

-- BLOCK quit_group
DELETE FROM group_users
WHERE user_id = $user_id AND group_id IN (
                                        SELECT gr.id
                                        FROM assessments ass
                                        JOIN group_configs gc ON gc.assessment_id = ass.id
                                        JOIN groups gr ON gr.group_config_id = gc.id
                                        WHERE ass.id = $assessment_id);
