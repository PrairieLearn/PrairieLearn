CREATE OR REPLACE FUNCTION calculate_predicted_assessment_score(
    assessment_question_ids BIGINT[]
) RETURNS DOUBLE PRECISION
AS $$
BEGIN
    RETURN (
        WITH aq_ids AS (
            SELECT
                unnest(assessment_question_ids) AS assessment_question_id
        )
        SELECT
            sum(calculate_predicted_question_points(aq.id)) / sum(aq.max_points)
        FROM
            aq_ids
            JOIN assessment_questions AS aq ON (aq.id = aq_ids.assessment_question_id));
END;
$$ LANGUAGE plpgsql;
