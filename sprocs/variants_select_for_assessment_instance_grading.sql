DROP FUNCTION IF EXISTS variants_select_for_assessment_instance(bigint);

CREATE OR REPLACE FUNCTION
    variants_select_for_assessment_instance_grading (
        IN assessment_instance_id bigint,
        OUT variant jsonb,
        OUT question jsonb,
        OUT course jsonb
    ) RETURNS SETOF RECORD
AS $$
DECLARE
    current_open boolean;
BEGIN
    -- ######################################################################
    -- check everything is ok

    SELECT ai.open
    INTO current_open
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id; END IF;

    IF NOT current_open THEN RAISE EXCEPTION 'assessment is already closed: %', assessment_instance_id; END IF;

    -- ######################################################################
    -- select the most recent variant for each instance_question

    RETURN QUERY
    SELECT DISTINCT ON (iq.id)
        to_jsonb(v.*) AS variant,
        to_jsonb(q.*) AS question,
        to_jsonb(c.*) AS course
    FROM
        variants AS v
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN questions AS q ON (q.id = v.question_id)
        JOIN pl_courses AS c ON (c.id = q.course_id)
    WHERE ai.id = variants_select_for_assessment_instance_grading.assessment_instance_id
    ORDER BY iq.id, v.date DESC;
END;
$$ LANGUAGE plpgsql VOLATILE;
