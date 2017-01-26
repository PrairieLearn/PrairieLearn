-- BLOCK update
INSERT INTO instance_questions
        (current_value,  assessment_instance_id, assessment_question_id)
(
    SELECT
        aq.init_points, $assessment_instance_id, aq.assessment_question_id
    FROM
        select_assessment_questions($assessment_id, $assessment_instance_id) AS aq
)
ON CONFLICT (assessment_question_id, assessment_instance_id) DO NOTHING;

-- BLOCK get_questions
SELECT
    iq.*,
    ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
    z.id AS zone_id,
    z.title AS zone_title,
    q.title AS question_title,
    aq.max_points,
    qo.row_order,
    qo.question_number
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN question_order($assessment_instance_id) AS qo ON (iq.id = qo.instance_question_id)
WHERE
    iq.assessment_instance_id = $assessment_instance_id
WINDOW
    w AS (ORDER BY qo.row_order)
ORDER BY qo.row_order;
