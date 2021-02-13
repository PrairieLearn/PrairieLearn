CREATE OR REPLACE FUNCTION
    questions_select (
        IN question_id bigint,
        IN instance_question_id bigint,
        OUT question questions
    )
AS $$
BEGIN
    IF instance_question_id IS NULL THEN
        SELECT *
        INTO question
        FROM questions
        WHERE id = question_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'no such question_id: %', question_id; END IF;
    ELSE 
        SELECT q.*, ci.question_params
        INTO question
        FROM
            instance_questions AS iq
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN assessments AS aset ON (aset.id = aq.assessment_id)
            JOIN course_instances AS ci ON (ci.id = aset.course_instance_id)
            --JOIN pl_course AS pc ON (pc.id = ci.course_id)
            JOIN questions AS q ON (q.id = aq.question_id)
        WHERE iq.id = instance_question_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id; END IF;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
