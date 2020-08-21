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
