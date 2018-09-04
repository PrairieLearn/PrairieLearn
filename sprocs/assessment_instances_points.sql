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
    assessment_type enum_assessment_type;
    total_points DOUBLE PRECISION;
    total_points_in_grading DOUBLE PRECISION;
    max_points DOUBLE PRECISION;
    current_score_perc DOUBLE PRECISION;
    max_possible_points DOUBLE PRECISION;
    max_possible_score_perc DOUBLE PRECISION;
BEGIN
    -- #########################################################################
    -- determine the assessment type

    SELECT a.type
    INTO assessment_type
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No assessment_instance found with id: %', assessment_instance_id;
    END IF;

    IF NOT ((assessment_type = 'Exam') OR (assessment_type = 'Homework')) THEN
        RAISE EXCEPTION 'Unknown assessment_type: %', assessment_type;
    END IF;

    -- #########################################################################
    -- compute the total points

    WITH points_by_zone AS (
            SELECT
                LEAST(sum(iq.points), z.max_points) AS points,
                LEAST(sum(iq.points_in_grading), z.max_points) AS points_in_grading
            FROM
                instance_questions AS iq
                JOIN assessment_questions as aq ON (aq.id = iq.assessment_question_id)
                JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
                JOIN zones AS z ON (z.id = ag.zone_id)
            WHERE
                iq.assessment_instance_id = assessment_instances_points.assessment_instance_id
                -- drop deleted questions unless assessment type is Exam
                AND ((aq.deleted_at IS NULL) OR (assessment_type = 'Exam'))
            GROUP BY
                z.id
        )
    SELECT
        sum(points_by_zone.points),
        sum(points_by_zone.points_in_grading)
    INTO
        total_points,
        total_points_in_grading
    FROM
        points_by_zone;

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
