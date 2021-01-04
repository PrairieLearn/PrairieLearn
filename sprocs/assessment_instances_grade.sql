DROP FUNCTION IF EXISTS assessment_instances_grade(bigint,bigint,integer,boolean);
DROP FUNCTION IF EXISTS assessment_instances_grade(bigint,bigint,integer,boolean,boolean);
DROP FUNCTION IF EXISTS assessment_points(bigint,integer);
DROP FUNCTION IF EXISTS assessment_points(bigint,integer,boolean);

CREATE OR REPLACE FUNCTION
    assessment_instances_grade(
        IN assessment_instance_id bigint,
        IN authn_user_id bigint,
        IN credit integer DEFAULT NULL,
        IN only_log_if_score_updated boolean DEFAULT FALSE,
        IN allow_decrease boolean DEFAULT FALSE,
        OUT updated boolean,
        OUT new_points double precision,
        OUT new_score_perc double precision
    )
AS $$
DECLARE
    old_values record;
    new_values record;
    new_assessment_instance assessment_instances%ROWTYPE;
    log_update boolean;
    use_credit integer;
    points DOUBLE PRECISION;
    points_in_grading DOUBLE PRECISION;
    score_perc DOUBLE PRECISION;
    score_perc_in_grading DOUBLE PRECISION;
    total_points DOUBLE PRECISION;
    total_points_in_grading DOUBLE PRECISION;
    max_points DOUBLE PRECISION;
    current_score_perc DOUBLE PRECISION;
    max_possible_points DOUBLE PRECISION;
    max_possible_score_perc DOUBLE PRECISION;
    instance_questions_used_for_grade BIGINT[];
BEGIN
    SELECT ai.points, ai.points_in_grading, ai.score_perc, ai.score_perc_in_grading
    INTO old_values
    FROM assessment_instances AS ai
    WHERE id = assessment_instance_id;

    IF credit IS NOT NULL THEN
        use_credit := credit;
    ELSE
        -- determine credit from the last submission, if any
        SELECT s.credit
        INTO use_credit
        FROM
            submissions AS s
            JOIN variants AS v ON (v.id = s.variant_id)
            JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        WHERE iq.assessment_instance_id = assessment_instances_grade.assessment_instance_id
        ORDER BY s.date DESC
        LIMIT 1;

        use_credit := coalesce(use_credit, 0);
    END IF;


    -- #########################################################################
    -- get points by zone

    WITH
        t_points_by_zone AS (SELECT * FROM assessment_instances_points(assessment_instance_id)),
        t_used_for_grade AS (SELECT unnest(iq_ids) AS iq_ids FROM t_points_by_zone),
        v_used_for_grade AS (SELECT array_agg(iq_ids) AS iq_ids FROM t_used_for_grade),
        v_total_points AS (SELECT sum(t_points_by_zone.points) AS total_points FROM t_points_by_zone)
    SELECT
        v_total_points.total_points, v_used_for_grade.iq_ids
    INTO
        total_points, instance_questions_used_for_grade
    FROM
        v_total_points, v_used_for_grade;


    -- #########################################################################
    -- compute the total points

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
    IF use_credit < 100 THEN
        score_perc := least(score_perc, use_credit);
    ELSIF (use_credit > 100) AND (points = max_points) THEN
        score_perc := use_credit;
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
    IF use_credit < 100 THEN
        max_possible_score_perc := least(max_possible_score_perc, use_credit);
    ELSIF (use_credit > 100) AND (max_possible_points = max_points) THEN
        max_possible_score_perc := use_credit;
    END IF;

    IF NOT allow_decrease THEN
        -- no matter what, don't decrease the achieveable score_perc below new score_perc
        max_possible_score_perc := greatest(max_possible_score_perc, score_perc);
    END IF;

    -- compute score_perc_in_grading
    score_perc_in_grading := max_possible_score_perc - score_perc;

    -- pack everything into new_values
    SELECT points, points_in_grading, score_perc, score_perc_in_grading
    INTO new_values;

    -- #########################################################################
    -- Update instance_questions (which questions were used for grading)

    UPDATE instance_questions AS iq
    SET
        used_for_grade = (iq.id = ANY(instance_questions_used_for_grade))
    WHERE
        iq.assessment_instance_id = assessment_instances_grade.assessment_instance_id;

    -- #########################################################################
    -- Update assessment_instances (points and scores)

    UPDATE assessment_instances AS ai
    SET
        points = new_values.points,
        points_in_grading = new_values.points_in_grading,
        score_perc = new_values.score_perc,
        score_perc_in_grading = new_values.score_perc_in_grading,
        modified_at = now()
    WHERE ai.id = assessment_instance_id
    RETURNING ai.*
    INTO new_assessment_instance;

    -- #########################################################################
    -- Update log

    log_update := TRUE;
    updated := TRUE;
    IF old_values = new_values THEN
        updated := FALSE;
        IF only_log_if_score_updated THEN
            log_update := FALSE;
        END IF;
    END IF;

    IF log_update THEN
        INSERT INTO assessment_score_logs
            (    assessment_instance_id, auth_user_id,                          max_points,
                  points,                 points_in_grading,            score_perc,            score_perc_in_grading)
        VALUES
            (new_assessment_instance.id, authn_user_id, new_assessment_instance.max_points,
            new_values.points, new_values.points_in_grading, new_values.score_perc, new_values.score_perc_in_grading);
    END IF;

    new_points := new_values.points;
    new_score_perc := new_values.score_perc;
END;
$$ LANGUAGE plpgsql VOLATILE;
