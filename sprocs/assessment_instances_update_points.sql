DROP FUNCTION IF EXISTS assessment_instances_update_points(bigint,double precision,bigint);

CREATE OR REPLACE FUNCTION
    assessment_instances_update_points(
        IN assessment_instance_id bigint,
        IN new_points double precision,
        IN authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    max_points double precision;
    new_score_perc double precision;
BEGIN
    SELECT ai.max_points INTO max_points FROM assessment_instances AS ai WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id; END IF;

    new_score_perc := new_points / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;

    WITH updated_assessment_instances AS (
        UPDATE assessment_instances AS ai
        SET
            points = new_points,
            points_in_grading = 0,
            score_perc = new_score_perc,
            score_perc_in_grading = 0,
            modified_at = now()
        WHERE ai.id = assessment_instance_id
        RETURNING ai.*
    )
    INSERT INTO assessment_score_logs
        (assessment_instance_id,  auth_user_id,    max_points,
           points,    points_in_grading,    score_perc,    score_perc_in_grading)
    SELECT
                          ai.id, authn_user_id, ai.max_points,
        ai.points, ai.points_in_grading, ai.score_perc, ai.score_perc_in_grading
    FROM
        updated_assessment_instances AS ai;
END;
$$ LANGUAGE plpgsql VOLATILE;
