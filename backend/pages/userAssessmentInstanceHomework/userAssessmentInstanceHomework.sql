-- BLOCK update
WITH new_instance_questions AS (
    SELECT
        aq.number AS order_by,
        0 AS points,
        aq.init_points AS current_value,
        0 AS number_attempts,
        $assessment_instance_id::integer AS assessment_instance_id,
        aq.id AS assessment_question_id
    FROM
        assessment_questions AS aq
    WHERE
        aq.assessment_id = $assessment_id
        AND aq.deleted_at IS NULL
)
INSERT INTO instance_questions (order_by, points, current_value, number_attempts, assessment_instance_id, assessment_question_id)
(SELECT * FROM new_instance_questions)
ON CONFLICT (assessment_question_id, assessment_instance_id) DO NOTHING;

-- BLOCK get_questions
SELECT
    iq.*,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY iq.order_by, iq.id) IS NULL) AS start_new_zone,
    z.title AS zone_title,
    q.title AS question_title,
    aq.max_points
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN zones AS z ON (z.id = aq.zone_id)
    JOIN questions AS q ON (q.id = aq.question_id)
WHERE
    iq.assessment_instance_id = $assessment_instance_id
    AND aq.deleted_at IS NULL
ORDER BY
    z.number, iq.order_by, iq.id;
