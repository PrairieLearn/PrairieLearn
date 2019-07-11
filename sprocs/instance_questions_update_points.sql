DROP FUNCTION IF EXISTS instance_questions_update_points(bigint,double precision,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_update_points(
        IN instance_question_id bigint,
        IN new_points double precision,
        IN authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    assessment_instance_id bigint;
    max_points double precision;
    new_score_perc double precision;
BEGIN
    SELECT                ai.id, aq.max_points
    INTO assessment_instance_id,    max_points
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE iq.id = instance_question_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such instance_question_id: %', instance_question_id; END IF;

    max_points := COALESCE(max_points, 0);

    new_score_perc := new_points / (CASE WHEN max_points > 0 THEN max_points ELSE 1 END) * 100;

    WITH updated_instance_questions AS (
        UPDATE instance_questions AS iq
        SET
            points = new_points,
            points_in_grading = 0,
            score_perc = new_score_perc,
            score_perc_in_grading = 0
        WHERE iq.id = instance_question_id
        RETURNING iq.*
    )
    INSERT INTO question_score_logs
        (instance_question_id,
        auth_user_id,
        max_points,    points,    score_perc)
    SELECT
        iq.id,
        instance_questions_update_points.authn_user_id,
        max_points, iq.points, iq.score_perc
    FROM updated_instance_questions AS iq;

    PERFORM assessment_instances_grade(assessment_instance_id, authn_user_id, credit => 100, allow_decrease => true);
END;
$$ LANGUAGE plpgsql VOLATILE;
