CREATE OR REPLACE FUNCTION calculate_predicted_question_score (
    qs_incremental_submission_score_array_averages DOUBLE PRECISION[],
    hw_qs_average_last_submission_score DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    max_points DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    result DOUBLE PRECISION;
    bound INTEGER;
BEGIN
    IF points_list IS NULL OR max_points IS NULL THEN
        RETURN NULL;
    END IF;
    IF qs_incremental_submission_score_array_averages IS NOT NULL THEN
        result = 0;
        bound = LEAST(array_length(qs_incremental_submission_score_array_averages, 1), array_length(points_list, 1));
        FOR i IN 1.. bound LOOP
            result = result + qs_incremental_submission_score_array_averages[i] * points_list[i];
        END LOOP;
        RETURN 100 * result / max_points;
    ELSE
        RETURN 100 * hw_qs_average_last_submission_score;
    END IF;
END
$$ LANGUAGE plpgsql;