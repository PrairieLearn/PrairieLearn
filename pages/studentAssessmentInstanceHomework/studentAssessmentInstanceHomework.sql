-- BLOCK select_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.id = $assessment_instance_id;

-- BLOCK get_questions
SELECT
    iq.*,
    ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
    z.id AS zone_id,
    z.title AS zone_title,
    q.title AS question_title,
    aq.max_points,
    qo.row_order,
    qo.question_number,
    aq.init_points,
    z.max_points AS zone_max_points,
    (z.max_points IS NOT NULL) AS zone_has_max_points,
    z.best_questions AS zone_best_questions,
    (z.best_questions IS NOT NULL) AS zone_has_best_questions,
    (SELECT count(*) FROM files AS f WHERE f.instance_question_id = iq.id AND f.deleted_at IS NULL) AS file_count,
    qo.sequence_locked AS sequence_locked,
    (lag(aq.effective_advance_score_perc) OVER w) AS prev_advance_score_perc,
    (lag(qo.question_number) OVER w) AS prev_title,
    (lag(qo.sequence_locked) OVER w) AS prev_sequence_locked
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN question_order($assessment_instance_id) AS qo ON (iq.id = qo.instance_question_id)
WHERE
    iq.assessment_instance_id = $assessment_instance_id
    AND aq.deleted_at IS NULL
WINDOW
    w AS (ORDER BY qo.row_order)
ORDER BY qo.row_order;

-- BLOCK get_group_info
SELECT 
    gu.group_id, g.name, g.join_code, u.uid, gc.student_authz_join, gc.student_authz_create, gc.student_authz_leave
FROM
    assessment_instances ai
    JOIN group_configs AS gc ON ai.assessment_id = gc.assessment_id
    JOIN groups AS g ON g.group_config_id = gc.id
    JOIN group_users AS gu ON gu.group_id = g.id
    JOIN group_users AS gu2 ON gu2.group_id = gu.group_id
    JOIN users AS u ON u.user_id = gu2.user_id
WHERE 
    ai.id = $assessment_instance_id 
    AND gu.user_id = $user_id 
    AND g.deleted_at IS NULL 
    AND gc.deleted_at IS NULL;

-- BLOCK leave_group
WITH log AS (
    DELETE FROM
        group_users
    WHERE 
        user_id = $user_id 
        AND group_id IN (SELECT 
                            g.id
                        FROM 
                            assessment_instances ai
                            JOIN group_configs AS gc ON gc.assessment_id = ai.assessment_id
                            JOIN groups AS g ON g.group_config_id = gc.id
                        WHERE 
                            ai.id = $assessment_instance_id
                            AND g.deleted_at IS NULL
                            AND gc.deleted_at IS NULL)
    RETURNING group_id
)
INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
SELECT $authn_user_id, $user_id, group_id, 'leave'
FROM log;
