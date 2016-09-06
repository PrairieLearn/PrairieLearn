
CREATE OR REPLACE FUNCTION
    assessment_points_homework(
        IN assessment_instance_id INTEGER,
        IN credit INTEGER,
        OUT points DOUBLE PRECISION,
        OUT score_perc INTEGER
    ) AS $$
DECLARE
    total_points DOUBLE PRECISION;
    max_points DOUBLE PRECISION;
    current_score_perc INTEGER;
BEGIN
    SELECT sum(iq.points) INTO total_points
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        iq.assessment_instance_id = assessment_points_homework.assessment_instance_id
        AND aq.deleted_at IS NULL;

    SELECT COALESCE(ai.max_points, a.max_points) INTO max_points
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        ai.id = assessment_instance_id;

    SELECT ai.score_perc INTO current_score_perc FROM assessment_instances AS ai WHERE ai.id = assessment_instance_id;

    -- compute the score in points, maxing out at max_score
    points := least(total_points, max_points);

    -- compute the score as a percentage, applying credit bonus/limits
    score_perc := floor(points / max_points * 100);
    IF credit < 100 THEN
        score_perc := least(score_perc, credit);
    ELSIF (credit > 100) AND (points = max_points) THEN
        score_perc := credit;
    END IF;
    score_perc := greatest(score_perc, current_score_perc);

    RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
