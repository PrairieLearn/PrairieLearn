CREATE OR REPLACE FUNCTION
    questions_select (
        IN question_id bigint,
        IN instance_question_id bigint,
        OUT question jsonb
    )
AS $$
BEGIN
    IF instance_question_id IS NULL THEN
        SELECT to_jsonb(q.*) 
            || jsonb_build_object('question_params', COALESCE(pc.question_params, '{}'::jsonb)) 
        INTO question
        FROM questions AS q
        JOIN pl_courses AS pc ON q.course_id = pc.id
        WHERE q.id = question_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'no such question_id: %', question_id; END IF;
    ELSE 
        SELECT to_jsonb(q.*) 
            || jsonb_build_object('question_params', COALESCE(pc.question_params, '{}'::jsonb)
                || COALESCE(ci.question_params, '{}'::jsonb)
                || COALESCE(aset.question_params, '{}'::jsonb)
                || COALESCE(z.question_params, '{}'::jsonb)
                || COALESCE(ag.question_params, '{}'::jsonb)
                || COALESCE(aq.question_params, '{}'::jsonb)
        INTO question
        FROM
            instance_questions AS iq
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
            JOIN zones AS z ON (z.id = ag.zone_id)
            JOIN assessments AS aset ON (aset.id = aq.assessment_id)
            JOIN course_instances AS ci ON (ci.id = aset.course_instance_id)
            JOIN pl_courses AS pc ON (pc.id = ci.course_id)
            JOIN questions AS q ON (q.id = aq.question_id)
        WHERE iq.id = instance_question_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id; END IF;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
