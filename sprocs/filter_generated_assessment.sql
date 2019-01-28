CREATE OR REPLACE FUNCTION
    filter_generated_assessment(
        IN generated_assessment_question_ids BIGINT[],
        IN means DOUBLE PRECISION[],
        IN sds DOUBLE PRECISION[],
        IN assessment_domain enum_statistic_domain,
        IN num_sds DOUBLE PRECISION,
        OUT keep BOOLEAN
    )
AS $$
BEGIN
    SELECT
        bool_and(
            assessment_scores.predicted_score < means[assessment_scores.quintile] - num_sds * sds[assessment_scores.quintile] OR
            assessment_scores.predicted_score > means[assessment_scores.quintile] + num_sds * sds[assessment_scores.quintile])
    FROM
        calculate_predicted_assessment_score_quintiles_flattened(generated_assessment_question_ids) AS assessment_scores
    INTO keep;
END;
$$ LANGUAGE plpgsql VOLATILE;
