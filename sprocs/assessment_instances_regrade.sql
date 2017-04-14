CREATE OR REPLACE FUNCTION
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
    old_points DOUBLE PRECISION;
    old_score DOUBLE PRECISION;
    new_points DOUBLE PRECISION;
    course_id bigint;
    course_instance_id bigint;
    user_id bigint;
    credit INTEGER;
    assessment_instance_updated boolean;
BEGIN
    -- lock the assessment instance for updating and store old points/score_perc
    SELECT
        ai.points,
        ai.score_perc,
        c.id,
        ci.id,
        u.user_id
    INTO
        old_points,
        old_score_perc,
        course_id,
        course_instance_id,
        user_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN users AS u USING (user_id)
    WHERE
        ai.id = assessment_instance_id
    FOR UPDATE OF ai;

    -- regrade questions, log it, and store the list of updated questions
    WITH updated_instance_questions AS (
        UPDATE instance_questions AS iq
        SET
            points = aq.max_points,
            score_perc = 100,
            points_in_grading = 0,
            score_perc_in_grading = 0
        FROM
            assessment_questions AS aq
            JOIN questions AS q ON (q.id = aq.question_id)
        WHERE
            aq.id = iq.assessment_question_id
            AND iq.assessment_instance_id = assessment_instances_regrade.assessment_instance_id
            AND aq.force_max_points
            AND iq.points < aq.max_points
        RETURNING
            iq.*,
            aq.max_points
    ),
    log_result AS (
        INSERT INTO question_score_logs
            (instance_question_id, auth_user_id,
                points, max_points, score_perc)
        (
            SELECT
                id,                assessment_instances_regrade.authn_user_id,
                points, max_points, score_perc
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

    updated := (cardinality(updated_question_names) > 0);

    -- determine credit from the last submission, if any
    SELECT
        s.credit
    INTO
        credit
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    WHERE
        iq.assessment_instance_id = assessment_instances_regrade.assessment_instance_id
    ORDER BY
        s.date DESC
    LIMIT 1;

    IF credit IS NULL THEN
        credit := 0;
    END IF;

    -- regrade the assessment instance
    SELECT *
    INTO assessment_instance_updated, new_points, new_score_perc
    FROM assessment_instances_grade(assessment_instance_id, authn_user_id, credit, TRUE);

    updated := updated OR assessment_instance_updated;
END;
$$ LANGUAGE plpgsql VOLATILE;
