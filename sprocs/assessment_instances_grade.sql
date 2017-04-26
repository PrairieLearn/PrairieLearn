CREATE OR REPLACE FUNCTION
    assessment_instances_grade(
        IN assessment_instance_id bigint,
        IN authn_user_id bigint,
        IN credit integer,
        IN only_log_if_score_updated boolean DEFAULT FALSE,
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
BEGIN
    SELECT points, points_in_grading, score_perc, score_perc_in_grading
    INTO old_values
    FROM assessment_instances
    WHERE id = assessment_instance_id;

    SELECT *
    INTO new_values
    FROM assessment_instances_points(assessment_instance_id, credit);

    UPDATE assessment_instances AS ai
    SET
        points = new_values.points,
        points_in_grading = new_values.points_in_grading,
        score_perc = new_values.score_perc,
        score_perc_in_grading = new_values.score_perc_in_grading
    WHERE ai.id = assessment_instance_id
    RETURNING ai.*
    INTO new_assessment_instance;

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
