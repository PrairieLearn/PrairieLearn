CREATE FUNCTION
    instance_questions_lock (
        instance_question_id bigint
    ) RETURNS void
AS $$
DECLARE
    assessment_instance_id bigint;
BEGIN
    SELECT ai.id INTO assessment_instance_id
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE iq.id = instance_question_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id; END IF;

    -- lock the assessment_instance
    PERFORM ai.id
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id
    FOR NO KEY UPDATE OF ai;
END;
$$ LANGUAGE plpgsql VOLATILE;
