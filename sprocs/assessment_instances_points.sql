DROP FUNCTION IF EXISTS assessment_points(bigint,integer);
DROP FUNCTION IF EXISTS assessment_points(bigint,integer,boolean);

CREATE OR REPLACE FUNCTION
    assessment_instances_points(
        IN assessment_instance_id bigint,
        IN credit INTEGER,
        IN allow_decrease BOOLEAN DEFAULT FALSE,
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
    -- #########################################################################
    -- compute the total points

    SELECT
        sum(points_by_zone.points)
    INTO
        total_points
    FROM
        zones_points(assessment_instance_id) AS points_by_zone;

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

    IF NOT allow_decrease THEN
        -- no matter what, don't decrease the score_perc
        score_perc := greatest(score_perc, current_score_perc);
    END IF;

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

    IF NOT allow_decrease THEN
        -- no matter what, don't decrease the achieveable score_perc below new score_perc
        max_possible_score_perc := greatest(max_possible_score_perc, score_perc);
    END IF;

    -- compute score_perc_in_grading
    score_perc_in_grading := max_possible_score_perc - score_perc;
END;
$$ LANGUAGE plpgsql STABLE;
