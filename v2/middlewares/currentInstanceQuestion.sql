-- get all the instance_questions that share the assessment_instance
-- with the desired instance_question so we can sort them to
-- determine next/prev ids
WITH augmented_instance_questions AS (
    SELECT
        iq.*,
        aq.question_id,
        (lag(iq.id) OVER w) AS prev_instance_question_id,
        (lead(iq.id) OVER w) AS next_instance_question_id,
        qo.question_number,
        CASE
            WHEN a.type = 'Exam' THEN COALESCE(iq.points_list[1], 0)
            ELSE aq.max_points
        END AS max_points,
        iq.points_list[(iq.number_attempts + 2):array_length(iq.points_list, 1)] AS remaining_points,
        CASE
            WHEN a.type = 'Exam' THEN exam_question_status(iq)
            ELSE NULL
        END AS status
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN zones AS z ON (z.id = aq.zone_id)
    WHERE
        ai.id IN (SELECT assessment_instance_id FROM instance_questions WHERE id = $instance_question_id)
    WINDOW
        w AS (ORDER BY qo.row_order)
)
SELECT * FROM augmented_instance_questions WHERE id = $instance_question_id;
