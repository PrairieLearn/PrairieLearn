CREATE OR REPLACE FUNCTION calculate_predicted_question_score_sd (
    qs_incremental_submission_score_array_variances DOUBLE PRECISION[],
    hw_qs_average_last_submission_score_variance DOUBLE PRECISION,
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
    IF qs_incremental_submission_score_array_variances IS NOT NULL THEN
        result = 0;
        bound = LEAST(array_length(qs_incremental_submission_score_array_variances, 1), array_length(points_list, 1));
        FOR i IN 1.. bound LOOP
            result = result + coalesce(qs_incremental_submission_score_array_variances[i], 0) * points_list[i];
        END LOOP;
        result = result / max_points;
        RETURN sqrt(result);
    ELSE
        RETURN sqrt(hw_qs_average_last_submission_score_variance);
    END IF;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_predicted_question_score_sd(
    assessment_question_id BIGINT
) RETURNS DOUBLE PRECISION
AS $$
BEGIN
    RETURN (
        SELECT
            calculate_predicted_question_score_sd(
                qs.incremental_submission_score_array_variances,
                hw_qs.last_submission_score_variance,
                aq.points_list,
                aq.max_points)
        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            LEFT JOIN question_statistics AS qs ON (qs.question_id = aq.question_id AND qs.domain = get_domain(a.type, a.mode))
            LEFT JOIN question_statistics AS hw_qs ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
        WHERE
            aq.id = assessment_question_id
    );
END;
$$ LANGUAGE plpgsql;
