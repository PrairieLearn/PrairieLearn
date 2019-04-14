CREATE OR REPLACE FUNCTION calculate_predicted_question_score_quintiles_sd(
    assessment_question_id BIGINT
) RETURNS DOUBLE PRECISION[]
AS $$
BEGIN
    RETURN (
        WITH predicted_question_score_quintiles_sd_flattened AS (
            SELECT
                quintiles.quintile,
                calculate_predicted_question_score_sd(
                    slice(qs.incremental_submission_score_array_variance_quintiles, quintiles.quintile),
                    hw_qs.last_submission_score_variance[quintiles.quintile],
                    aq.points_list,
                    aq.max_points) AS quintile_score_sd
            FROM
                assessment_questions AS aq
                JOIN assessments AS a ON (a.id = aq.assessment_id)
                LEFT JOIN question_statistics AS qs ON (qs.question_id = aq.question_id AND qs.domain = get_domain(a.type, a.mode))
                LEFT JOIN question_statistics AS hw_qs ON (hw_qs.question_id = aq.question_id AND hw_qs.domain = get_domain('Homework', 'Public'))
                JOIN generate_series(1,5) AS quintiles (quintile) ON TRUE
            WHERE
                aq.id = assessment_question_id
        )
        SELECT
            array_agg(predicted_question_score_quintiles_sd_flattened.quintile_score_sd)
        FROM
            predicted_question_score_quintiles_sd_flattened
    );
END;
$$ LANGUAGE plpgsql;
