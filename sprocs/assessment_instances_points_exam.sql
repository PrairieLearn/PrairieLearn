DROP FUNCTION IF EXISTS assessment_points_exam(bigint,integer);

CREATE OR REPLACE FUNCTION
    assessment_instances_points_exam(
        IN assessment_instance_id bigint,
        IN credit INTEGER,
        OUT points DOUBLE PRECISION,
        OUT points_in_grading DOUBLE PRECISION,
        OUT score_perc DOUBLE PRECISION,
        OUT score_perc_in_grading DOUBLE PRECISION
    ) AS $$
DECLARE
    total_points DOUBLE PRECISION;
    total_points_in_grading DOUBLE PRECISION;
    max_points DOUBLE PRECISION;
    current_score_perc DOUBLE PRECISION;
    max_possible_points DOUBLE PRECISION;
    max_possible_score_perc DOUBLE PRECISION;
BEGIN
    SELECT sum(iq.points), sum(iq.points_in_grading) INTO total_points, total_points_in_grading
    FROM instance_questions AS iq
    WHERE iq.assessment_instance_id = assessment_instances_points_exam.assessment_instance_id;

    SELECT ai.max_points INTO max_points
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    SELECT ai.score_perc INTO current_score_perc
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    -- #########################################################################
    -- awarded points and score_perc

    -- compute the score in points, maxing out at max_points
    points := least(total_points, max_points);

    -- compute the score as a percentage, applying credit bonus/limits
    score_perc := points
        / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;
    IF credit < 100 THEN
        score_perc := least(score_perc, credit);
    ELSIF (credit > 100) AND (points = max_points) THEN
        score_perc := credit;
    END IF;

    -- no matter what, don't decrease the score_perc
    score_perc := greatest(score_perc, current_score_perc);

    -- #########################################################################
    -- in_grading versions of points and score_perc
    -- computed by finding max_possible points and score_perc
    -- and then subtracting off the new values of each quantity

    -- repeat calculation for points_in_grading
    max_possible_points := least(points + total_points_in_grading, max_points);
    total_points_in_grading := max_possible_points - points;

    -- compute max achieveable score_perc if all grading points are awarded
    max_possible_score_perc := max_possible_points
        / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;
    IF credit < 100 THEN
        max_possible_score_perc := least(max_possible_score_perc, credit);
    ELSIF (credit > 100) AND (max_possible_points = max_points) THEN
        max_possible_score_perc := credit;
    END IF;
    
    -- no matter what, don't decrease the achieveable score_perc below new score_perc
    max_possible_score_perc := greatest(max_possible_score_perc, score_perc);

    -- compute score_perc_in_grading
    score_perc_in_grading := max_possible_score_perc - score_perc;

    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;
