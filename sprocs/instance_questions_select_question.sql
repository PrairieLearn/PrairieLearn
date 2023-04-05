CREATE FUNCTION
    instance_questions_select_question (
        IN instance_question_id bigint,
        OUT question questions
    )
AS $$
BEGIN
    SELECT q.*
    INTO question
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
    WHERE iq.id = instance_question_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
