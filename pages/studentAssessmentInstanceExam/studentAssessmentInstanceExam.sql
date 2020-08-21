-- BLOCK select_instance_questions
SELECT
    iq.*,
    ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
    z.id AS zone_id,
    z.title AS zone_title,
    q.title AS question_title,
    aq.max_points,
    qo.row_order,
    qo.question_number,
    z.max_points AS zone_max_points,
    (z.max_points IS NOT NULL) AS zone_has_max_points,
    z.best_questions AS zone_best_questions,
    (z.best_questions IS NOT NULL) AS zone_has_best_questions,
    (SELECT count(*) FROM files AS f WHERE f.instance_question_id = iq.id AND f.deleted_at IS NULL) AS file_count
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
WHERE
    ai.id = $assessment_instance_id
WINDOW
    w AS (ORDER BY qo.row_order)
ORDER BY qo.row_order;

-- BLOCK get_group_info
SELECT 
    gu.group_id, gr.name, gr.join_code, us.uid, gc.student_authz_join, gc.student_authz_create, gc.student_authz_leave
FROM
    assessment_instances ai
    JOIN group_configs gc ON ai.assessment_id = gc.assessment_id
    JOIN groups gr ON gr.group_config_id = gc.id
    JOIN group_users gu ON gu.group_id = gr.id
    JOIN group_users gu2 ON gu2.group_id = gu.group_id
    JOIN users us ON us.user_id = gu2.user_id
WHERE 
    ai.id = $assessment_instance_id 
    AND gu.user_id = $user_id 
    AND gr.deleted_at IS NULL 
    AND gc.deleted_at IS NULL;
