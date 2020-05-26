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