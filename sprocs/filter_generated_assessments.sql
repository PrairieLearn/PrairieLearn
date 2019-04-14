CREATE OR REPLACE FUNCTION
    filter_generated_assessments(
        IN generated_assessment_question_ids BIGINT[][],
        IN means DOUBLE PRECISION[],
        IN sds DOUBLE PRECISION[],
        IN assessment_type enum_assessment_type,
        IN assessment_mode enum_mode,
        IN num_sds DOUBLE PRECISION,
        OUT filtered_assessment_question_ids_new BIGINT[][],
        OUT keep_array BOOLEAN[]
    )
AS $$
DECLARE
    assessment_question_ids_slice BIGINT[];
    num_reps INTEGER;
    num_questions INTEGER;
    keep BOOLEAN;
    num_assessments_kept INTEGER;
    filtered_assessment_question_ids BIGINT[][];
BEGIN
    num_reps = array_length(generated_assessment_question_ids, 1);
    num_questions = array_length(generated_assessment_question_ids, 2);
    filtered_assessment_question_ids = array_fill(NULL::BIGINT,
        ARRAY[num_reps, num_questions]);

    num_assessments_kept = 0;

    FOR i in 1..num_reps LOOP
        assessment_question_ids_slice = slice(generated_assessment_question_ids, i);
        keep = filter_generated_assessment(assessment_question_ids_slice, means, sds, assessment_type, assessment_mode, num_sds);

        keep_array = keep_array || keep;

        IF keep IS TRUE THEN
            num_assessments_kept = num_assessments_kept + 1;
            FOR j in 1..array_length(assessment_question_ids_slice, 1) LOOP
                filtered_assessment_question_ids[num_assessments_kept][j] = assessment_question_ids_slice[j];
            END LOOP;
        END IF;
    END LOOP;

    filtered_assessment_question_ids_new = array_fill(NULL::BIGINT, ARRAY[num_assessments_kept, num_questions]);

    FOR i in 1..num_assessments_kept LOOP
        FOR j in 1..num_questions LOOP
            filtered_assessment_question_ids_new[i][j] = filtered_assessment_question_ids[i][j];
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
