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
    (z.best_questions IS NOT NULL) AS zone_has_best_questions
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

-- BLOCK tmp_upgrade_iq_status
UPDATE instance_questions AS iq
SET
    status = exam_question_status(iq)::enum_instance_question_status
WHERE
    iq.assessment_instance_id = $assessment_instance_id;

-- BLOCK tmp_set_upgraded
UPDATE assessment_instances AS ai
SET
    tmp_upgraded_iq_status = TRUE
WHERE
    ai.id = $assessment_instance_id;
