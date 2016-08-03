SELECT
    iq.*,
    tq.question_id
FROM
    instance_questions AS iq
    JOIN test_questions AS tq ON (tq.id = iq.test_question_id)
WHERE
    iq.id = $instance_question_id
    AND tq.deleted_at IS NULL;
