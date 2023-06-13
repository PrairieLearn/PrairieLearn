CREATE FUNCTION
    variants_select_for_assessment_instance_grading (
        IN assessment_instance_id bigint,
        OUT variant jsonb,
        OUT question jsonb,
        OUT variant_course jsonb
    ) RETURNS SETOF RECORD
AS $$
BEGIN
    -- most recent variant for each instance_question
    RETURN QUERY
    SELECT DISTINCT ON (iq.id)
        to_jsonb(v.*) AS variant,
        to_jsonb(q.*) AS question,
        to_jsonb(vc.*) AS variant_course
    FROM
        variants AS v
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN questions AS q ON (q.id = v.question_id)
        JOIN pl_courses AS vc ON (vc.id = v.course_id)
    WHERE ai.id = variants_select_for_assessment_instance_grading.assessment_instance_id
    ORDER BY iq.id, v.date DESC;
END;
$$ LANGUAGE plpgsql VOLATILE;
