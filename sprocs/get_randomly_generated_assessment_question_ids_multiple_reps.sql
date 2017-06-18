CREATE FUNCTION
    get_randomly_generated_assessment_question_ids_multiple_reps(
    IN assessment_id_var BIGINT,
    IN num_reps INTEGER,
    OUT total_generated_assessment_question_ids BIGINT[][]
)
AS $$
DECLARE
    num_assessment_questions_in_an_assessment INTEGER;
    generated_assessment_question_ids BIGINT[];
BEGIN
    num_assessment_questions_in_an_assessment = get_num_assessment_questions_in_assessment(assessment_id_var);
    total_generated_assessment_question_ids = array_fill(NULL::BIGINT, ARRAY[num_reps, num_assessment_questions_in_an_assessment]);

    FOR i in 1..num_reps LOOP
        SELECT
            array_agg(generated_aq.assessment_question_id)
        FROM
            select_assessment_questions(assessment_id_var) AS generated_aq
        INTO
            generated_assessment_question_ids;

        FOR j in 1..num_assessment_questions_in_an_assessment LOOP
            total_generated_assessment_question_ids[i][j] = generated_assessment_question_ids[j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
