CREATE OR REPLACE FUNCTION
    get_randomly_generated_assessment_question_ids(
        IN assessment_id_var BIGINT,
        OUT generated_assessment_question_ids BIGINT[]
)
AS $$
BEGIN
    SELECT
        array_agg(generated_aq.assessment_question_id)
    FROM
        select_assessment_questions(assessment_id_var) AS generated_aq
    INTO
        generated_assessment_question_ids;
END;
$$ LANGUAGE plpgsql VOLATILE;