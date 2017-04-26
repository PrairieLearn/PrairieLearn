CREATE OR REPLACE FUNCTION
    assessment_instances_update_homework(
        assessment_instance_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    course_id bigint;
    user_id bigint;
    assessment_id bigint;
    assessment_type enum_assessment_type;
    assessment_max_points double precision;
    old_assessment_instance_max_points double_precision;
    new_assessment_instance_max_points double_precision;
BEGIN
    -- lock the assessment instance for update
    SELECT
        ai.id
    FROM
        assessment_instances AS ai
    WHERE
        ai.id = assessment_instance_id
    FOR UPDATE OF ai;

    -- get basic data about existing objects
    SELECT
        c.id,      u.user_id, a.id,          a.type,
        a.max_points,          ai.max_points
    INTO
        course_id, user_id,   assessment_id, assessment_type,
        assessment_max_points, old_assessment_instance_max_points
    FROM
        assessment_instances AS ai
        JOIN assesssments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN users AS u ON (u.user_id = ai.user_id)
    WHERE
        ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'assessment_instance_update_homework could not find assessment_instance_id: %', assessment_instance_id
    END IF;

    -- get new questions if any, insert them, and log it
    IF assessment_type != 'Homework' THEN
        RAISE EXCEPTION 'assessment_instance_update_homework called on non-homework, id: %', assessment_instance_id
    END IF;

    WITH new_instance_questions AS (
        INSERT INTO instance_questions AS iq
                (authn_user_id, current_value, assessment_instance_id, assessment_question_id)
        (
            SELECT
                authn_user_id, aq.init_points, assessment_instance_id, aq.assessment_question_id
            FROM
                select_assessment_questions(assessment_id, assessment_instance_id) AS aq
        )
        ON CONFLICT
            (assessment_question_id, assessment_instance_id) DO NOTHING
        RETURNING
            iq.*
    )
    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id,
        table_name,           row_id,
        action, new_state)
    SELECT
        authn_user_id, course_id, user_id,
        'instance_questions', iq.id,
        'insert', to_jsonb(iq.*))
    FROM
        new_instance_questions AS iq;

    -- determine the correct max_points
    new_assessment_instance_max_points = assessment_max_points
    IF new_assessment_instance_max_points IS NULL THEN
        SELECT
            sum(aq.max_points)
        INTO
            new_assessment_instance_max_points
        FROM
            instance_questions AS iq
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        WHERE
            iq.assessment_instance_id = assessment_instances_update_homework.assessment_instance_id
            AND aq.deleted_at IS NULL
    END IF;

    -- update max_points if necessary and log it
    IF new_assessment_instance_max_points != old_assessment_instance_max_points THEN
        UPDATE assessment_instances AS ai
        SET
            max_points = new_assessment_instance_max_points
        WHERE
            ai.id = assessment_instance_id;

        INSERT INTO audit_logs
            (authn_user_id, course_id, user_id,
            table_name,            column_name,  row_id,
            action,  old_state,
            new_state)
        VALUES
            (authn_user_id, course_id, user_id,
            'assessment_instances', 'max_points', assessment_instance_id,
            'update', jsonb_build_object('max_points', old_assessment_instance_max_points),
            jsonb_build_object('max_points', new_assessment_instance_max_points);

        -- FIXME: also call assessment_instances_points_homework and update ai.score_perc, etc
        -- and log it
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
