CREATE OR REPLACE FUNCTION
    calculate_incremental_submission_score_array(
        submission_score_array double precision[]
    ) returns double precision[]
AS $$
DECLARE
    incremental_submission_score_array double precision[];
    array_index integer := 1;
    max_submission_score double precision;
    submission_score double precision;
BEGIN
    LOOP
        submission_score := submission_score_array[array_index];

        IF (array_index = 1) THEN
            incremental_submission_score_array[1] = submission_score;
            max_submission_score := submission_score;
        ELSE

            IF (submission_score > max_submission_score) THEN
                incremental_submission_score_array[array_index] := submission_score - max_submission_score;
                max_submission_score := submission_score;
            ELSE
                incremental_submission_score_array[array_index] := 0;
            END IF;
        END IF;

        EXIT WHEN array_index = array_length(submission_score_array, 1);
        array_index := array_index + 1;
    END LOOP;

    RETURN incremental_submission_score_array;
END;
$$ LANGUAGE plpgsql VOLATILE;
