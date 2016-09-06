CREATE OR REPLACE FUNCTION
    question_order (
        assessment_instance_id INTEGER
    ) RETURNS TABLE (instance_question_id INTEGER, row_order INTEGER, question_number VARCHAR)
AS $$
SELECT
    iq.id AS instance_question_id,
    (row_number() OVER w)::integer AS row_order,
    CASE
        WHEN a.type = 'Homework' THEN
            CASE
                WHEN a.shuffle_questions THEN '#' || q.number::text
                ELSE aset.abbrev || a.number || '.' || aq.number::text
            END
        WHEN a.type = 'Exam' THEN (row_number() OVER w)::text
        ELSE aq.number::text
    END AS question_number
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN zones AS z ON (z.id = aq.zone_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    ai.id = question_order.assessment_instance_id
    AND aq.deleted_at IS NULL
WINDOW
    w AS (
        ORDER BY
            z.number,
            CASE
                WHEN a.type = 'Homework' THEN
                    CASE
                        WHEN a.shuffle_questions THEN iq.order_by
                        ELSE aq.number
                    END
                WHEN a.type = 'Exam' THEN iq.order_by
                ELSE aq.number
            END,
            iq.id
    );
$$ LANGUAGE SQL;
