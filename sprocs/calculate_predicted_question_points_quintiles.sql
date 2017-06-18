CREATE OR REPLACE FUNCTION calculate_predicted_question_points_quintiles (
    assessment_question_id BIGINT
) RETURNS DOUBLE PRECISION[] AS $$
BEGIN
    RETURN (
        WITH predicted_question_score_quintiles AS (
            SELECT
                unnest(calculate_predicted_question_score_quintiles(assessment_question_id)) AS predicted_question_score_quintiles
        )
        SELECT
            array_agg(predicted_question_score_quintiles * aq.max_points) AS predicted_question_points
        FROM
            assessment_questions AS aq
            JOIN predicted_question_score_quintiles ON TRUE
        WHERE
            aq.id = assessment_question_id);
END
$$ LANGUAGE plpgsql;
