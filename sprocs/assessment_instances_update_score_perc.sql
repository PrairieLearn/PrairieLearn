CREATE FUNCTION
    assessment_instances_update_score_perc(
        IN assessment_instance_id bigint,
        IN new_score_perc double precision,
        IN authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    max_points double precision;
    new_points double precision;
BEGIN
    SELECT ai.max_points INTO max_points FROM assessment_instances AS ai WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id; END IF;

    new_points := new_score_perc / 100 * max_points;

    WITH updated_assessment_instances AS (
        UPDATE assessment_instances AS ai
        SET
            points = new_points,
            score_perc = new_score_perc,
            modified_at = now()
        WHERE ai.id = assessment_instance_id
        RETURNING ai.*
    )
    INSERT INTO assessment_score_logs
        (assessment_instance_id, auth_user_id, max_points, points, score_perc)
    SELECT
        ai.id, authn_user_id, ai.max_points, ai.points, ai.score_perc
    FROM
        updated_assessment_instances AS ai;
END;
$$ LANGUAGE plpgsql VOLATILE;
