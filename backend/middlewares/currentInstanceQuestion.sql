-- we need to get all the instance_questions that share the
-- assessment_instance with the instance_question that we want so that we
-- can sort them and determine next/prev ids
WITH augmented_instance_questions AS (
    SELECT
        iq.*,
        aq.question_id,
        (lag(iq.id) OVER w) AS prev_instance_question_id,
        (lead(iq.id) OVER w) AS next_instance_question_id
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN zones AS z ON (z.id = aq.zone_id)
    WHERE
        iq.assessment_instance_id IN (SELECT assessment_instance_id FROM instance_questions WHERE id = $instance_question_id)
        AND aq.deleted_at IS NULL
    WINDOW
        w AS (ORDER BY z.number, iq.order_by, iq.id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
)
SELECT * FROM augmented_instance_questions WHERE id = $instance_question_id;
