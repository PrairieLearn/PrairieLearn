CREATE OR REPLACE FUNCTION get_generated_aq_ids(
    assessment_id_var BIGINT
) RETURNS BIGINT[]
AS $$
BEGIN
    RETURN (SELECT array_agg(aqs.assessment_question_id) FROM select_assessment_questions(assessment_id_var) AS aqs);
END;
$$ LANGUAGE plpgsql VOLATILE;
