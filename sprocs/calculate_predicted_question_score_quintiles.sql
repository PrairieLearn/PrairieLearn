CREATE OR REPLACE FUNCTION
    calculate_predicted_question_score_quintiles(
        qs_incremental_submission_score_array_quintile_averages DOUBLE PRECISION[][],
        hw_qs_average_last_submission_score_quintiles DOUBLE PRECISION[],
        points_list DOUBLE PRECISION[],
        max_points DOUBLE PRECISION
) RETURNS DOUBLE PRECISION[]
AS $$
BEGIN
    RETURN (
        WITH predicted_question_score_quintiles AS (
            SELECT
                quintiles.quintile AS quintile,
                calculate_predicted_question_score(
                    slice(qs_incremental_submission_score_array_quintile_averages, quintiles.quintile),
                    hw_qs_average_last_submission_score_quintiles[quintiles.quintile],
                    points_list,
                    max_points) AS predicted_question_score_quintile
            FROM
                generate_series(1, 5) AS quintiles (quintile)
            ORDER BY
                quintiles.quintile
        )
        SELECT
            array_agg(predicted_question_score_quintiles.predicted_question_score_quintile)
        FROM
            predicted_question_score_quintiles
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION
    calculate_predicted_question_score_quintiles(
        assessment_question_id BIGINT
) RETURNS DOUBLE PRECISION[]
AS $$
BEGIN
    RETURN (
        SELECT
            calculate_predicted_question_score_quintiles(
                qs.incremental_submission_score_array_quintile_averages,
                hw_qs.average_last_submission_score_quintiles,
                aq.points_list,
                aq.max_points)
        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            LEFT JOIN question_statistics AS qs
                ON (qs.question_id = aq.question_id AND qs.domain = get_domain(a.type, a.mode))
            LEFT JOIN question_statistics AS hw_qs
                ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
        WHERE
            aq.id = assessment_question_id
    );
END;
$$ LANGUAGE plpgsql;
