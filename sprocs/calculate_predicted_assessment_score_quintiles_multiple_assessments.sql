CREATE OR REPLACE FUNCTION
    calculate_predicted_assessment_score_quintiles_multiple_assessments(
    IN generated_assessment_question_ids BIGINT[][],
    OUT final_result DOUBLE PRECISION[][]
)
AS $$
DECLARE
    temp_result DOUBLE PRECISION[];
    num_reps INTEGER;
BEGIN
    num_reps = array_length(generated_assessment_question_ids, 1);
    final_result = array_fill(NULL::DOUBLE PRECISION, ARRAY[5, num_reps]);
    FOR i IN 1..num_reps LOOP
        temp_result = calculate_predicted_assessment_score_quintiles(slice(generated_assessment_question_ids, i)::BIGINT[]);
        FOR j in 1..5 LOOP
            final_result[j][i] = temp_result[j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
