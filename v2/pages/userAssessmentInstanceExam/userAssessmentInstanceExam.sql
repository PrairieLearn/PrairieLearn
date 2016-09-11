-- BLOCK get_questions
SELECT
    iq.*,
    ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
    z.id AS zone_id,
    z.title AS zone_title,
    q.title AS question_title,
    COALESCE(iq.points_list[1], 0) AS max_points,
    iq.points_list[(iq.number_attempts + 2):array_length(iq.points_list, 1)] AS remaining_points,
    exam_question_status(iq) AS status,
    qo.row_order,
    qo.question_number
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN zones AS z ON (z.id = aq.zone_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN question_order($assessment_instance_id) AS qo ON (iq.id = qo.instance_question_id)
WHERE
    iq.assessment_instance_id = $assessment_instance_id
WINDOW
    w AS (ORDER BY qo.row_order)
ORDER BY qo.row_order;

-- BLOCK get_work_list
SELECT
    to_jsonb(iq) AS instance_question,
    to_jsonb(q) AS question,
    to_jsonb(v) AS variant,
    to_jsonb(s) AS submission
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN LATERAL (
        SELECT *
        FROM submissions AS s
        WHERE s.variant_id = v.id
        ORDER BY date DESC
        LIMIT 1
    ) AS s ON (s.variant_id = v.id)
WHERE
    iq.assessment_instance_id = $assessment_instance_id
    AND s.score IS NULL;

-- BLOCK update_submission
UPDATE submissions AS s
SET
    graded_at = CURRENT_TIMESTAMP,
    score = $score,
    correct = $correct,
    feedback = $feedback
WHERE
    s.id = $submission_id;

-- BLOCK update_instance_question
UPDATE instance_questions AS iq
SET
    open = CASE
                WHEN $correct THEN false
                ELSE CASE
                        WHEN iq.number_attempts + 1 < array_length(iq.points_list, 1) THEN TRUE
                        ELSE FALSE
                END
            END,
    points = CASE WHEN $correct THEN iq.current_value ELSE 0 END,
    current_value = iq.points_list[iq.number_attempts + 2],
    number_attempts = iq.number_attempts + 1
WHERE
    iq.id = $instance_question_id;

-- BLOCK update_assessment_instance
UPDATE assessment_instances AS ai
SET
    points = new_values.points,
    score_perc = new_values.score_perc
FROM
    assessment_points_exam($assessment_instance_id, $credit) AS new_values
WHERE
    ai.id = $assessment_instance_id
RETURNING ai.*;

-- BLOCK close_assessment_instance
UPDATE assessment_instances AS ai
SET
    open = FALSE,
    closed_at = CURRENT_TIMESTAMP
WHERE
    ai.id = $assessment_instance_id
RETURNING ai.*;
