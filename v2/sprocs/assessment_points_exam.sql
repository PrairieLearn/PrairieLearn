
CREATE OR REPLACE FUNCTION
    assessment_points_exam(
        IN assessment_instance_id INTEGER,
        IN credit INTEGER,
        OUT points DOUBLE PRECISION,
        OUT score_perc INTEGER
    ) AS $$
DECLARE
    total_points DOUBLE PRECISION;
    max_points DOUBLE PRECISION;
BEGIN
    SELECT sum(iq.points) INTO total_points
    FROM instance_questions AS iq
    WHERE iq.assessment_instance_id = assessment_points_exam.assessment_instance_id;

    SELECT ai.max_points INTO max_points
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    -- compute the score in points, maxing out at max_points
    points := least(total_points, max_points);

    -- compute the score as a percentage, applying credit bonus/limits
    score_perc := floor(points / max_points * 100);
    IF credit < 100 THEN
        score_perc := least(score_perc, credit);
    ELSIF (credit > 100) AND (points = max_points) THEN
        score_perc := credit;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
