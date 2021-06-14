DROP FUNCTION IF EXISTS assessment_instances_update_points(bigint,double precision,bigint,boolean);

CREATE OR REPLACE FUNCTION
    assessment_instances_update_points(
        IN assessment_instance_id bigint,
        IN new_points double precision,
        IN authn_user_id bigint,
        IN assessment_id bigint,
        IN userid varchar,
        IN date timestamptz,
        IN score_only boolean
    ) RETURNS void
AS $$
DECLARE
    max_points double precision;
    new_score_perc double precision;
    new_instance_id bigint := assessment_instance_id;
    tmp_user_id bigint;
    tmp_group_work boolean;
    tmp_mode enum_mode;
    time_limit_min integer := NULL;
BEGIN
    SELECT ai.max_points INTO max_points FROM assessment_instances AS ai WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN
		IF score_only THEN
			SELECT user_id INTO tmp_user_id FROM users WHERE users.uid = userid;
			IF NOT FOUND THEN RAISE EXCEPTION 'no such user: %', userid; END IF;

			SELECT 
				group_work,
				mode
			INTO
				tmp_group_work,
				tmp_mode
			FROM assessments AS a WHERE a.id = assessment_id;

			IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment: %', assessment_id; END IF;
			
			SELECT tmp.assessment_instance_id INTO new_instance_id FROM assessment_instances_insert(assessment_id, tmp_user_id, tmp_group_work, authn_user_id, tmp_mode, time_limit_min, date) AS tmp;

			SELECT ai.max_points INTO max_points FROM assessment_instances AS ai WHERE ai.id = new_instance_id;
		ELSE
			RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id;
		END IF;
	END IF;
    
    new_score_perc := new_points / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;

    WITH updated_assessment_instances AS (
        UPDATE assessment_instances AS ai
        SET
            points = new_points,
            points_in_grading = 0,
            score_perc = new_score_perc,
            score_perc_in_grading = 0,
            modified_at = now()
        WHERE ai.id = new_instance_id
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
