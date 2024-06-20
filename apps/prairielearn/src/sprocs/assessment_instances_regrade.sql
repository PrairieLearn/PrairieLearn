CREATE FUNCTION
    assessment_instances_regrade(
        IN assessment_instance_id bigint,
        IN authn_user_id bigint,
        OUT updated boolean,
        OUT updated_question_names TEXT[],
        OUT old_score_perc DOUBLE PRECISION,
        OUT new_score_perc DOUBLE PRECISION
    )
AS $$
DECLARE
    assessment_type enum_assessment_type;
    old_points DOUBLE PRECISION;
    old_score DOUBLE PRECISION;
    new_points DOUBLE PRECISION;
    course_id bigint;
    course_instance_id bigint;
    assessment_instance_updated boolean;
BEGIN
    PERFORM assessment_instances_lock(assessment_instance_id);

    -- get the assessment type
    SELECT a.type
    INTO assessment_type
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE ai.id = assessment_instance_id;

    -- first update Homeworks
    updated := FALSE;
    IF assessment_type = 'Homework' THEN
        SELECT aiu.updated INTO updated
        FROM assessment_instances_update(assessment_instance_id, authn_user_id) AS aiu;
    END IF;

    -- store old points/score_perc
    SELECT ai.points,  ai.score_perc,      c.id,              ci.id
    INTO  old_points, old_score_perc, course_id, course_instance_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE ai.id = assessment_instance_id;

    -- regrade questions, log it, and store the list of updated questions
    WITH updated_instance_questions AS (
        UPDATE instance_questions AS iq
        SET
            points = aq.max_points,
            auto_points = aq.max_auto_points,
            manual_points = aq.max_manual_points,
            score_perc = 100,
            modified_at = now()
        FROM
            assessment_questions AS aq
        WHERE
            aq.id = iq.assessment_question_id
            AND iq.assessment_instance_id = assessment_instances_regrade.assessment_instance_id
            AND aq.force_max_points
            AND iq.points < aq.max_points
        RETURNING
            iq.*,
            aq.max_points,
            aq.max_auto_points,
            aq.max_manual_points
    ),
    log_result AS (
        INSERT INTO question_score_logs
            (instance_question_id, auth_user_id,
                points, auto_points, manual_points, max_points, max_auto_points, max_manual_points,
                score_perc)
        (
            SELECT
                id, assessment_instances_regrade.authn_user_id,
                points, auto_points, manual_points, max_points, max_auto_points, max_manual_points,
                score_perc
            FROM updated_instance_questions
        )
    )
    SELECT
        coalesce(array_agg(q.qid), ARRAY[]::TEXT[])
    INTO
        updated_question_names
    FROM
        updated_instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id);

    -- did we update any questions above?
    updated := updated OR (cardinality(updated_question_names) > 0);

    -- regrade the assessment instance
    SELECT *
    INTO assessment_instance_updated, new_points, new_score_perc
    FROM assessment_instances_grade(assessment_instance_id, authn_user_id, NULL, TRUE);

    -- did we update the grade?
    updated := updated OR assessment_instance_updated;
END;
$$ LANGUAGE plpgsql VOLATILE;
