CREATE OR REPLACE FUNCTION
    get_num_assessment_questions_in_assessment(
    IN assessment_id_var BIGINT,
    OUT num_assessment_questions INTEGER
)
AS $$
BEGIN
    SELECT
        count(generated_aq.assessment_question_id)
    FROM
        select_assessment_questions(assessment_id_var) AS generated_aq
    INTO
        num_assessment_questions;
END;
$$ LANGUAGE plpgsql VOLATILE;
