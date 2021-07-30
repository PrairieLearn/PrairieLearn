CREATE FUNCTION
    assessment_instances_update (
        IN assessment_instance_id bigint,
        IN authn_user_id bigint,
        OUT updated boolean,
        OUT new_instance_question_ids bigint[]
    )
AS $$
-- prefer column references over variables, needed for ON CONFLICT
#variable_conflict use_column
DECLARE
    course_id bigint;
    user_id bigint;
    group_id bigint;
    group_work boolean;
    assessment_id bigint;
    assessment_type enum_assessment_type;
    assessment_instance_open boolean;
    new_instance_questions_count integer;
    zones_total_max_points double precision;
    assessment_max_points double precision;
    assessment_max_bonus_points double precision;
    old_assessment_instance_max_points double precision;
    old_assessment_instance_max_bonus_points double precision;
    new_assessment_instance_max_points double precision;
BEGIN
    PERFORM assessment_instances_lock(assessment_instance_id);

    updated := false;
    new_instance_question_ids = array[]::bigint[];

    SELECT 
        a.group_work
    INTO 
        group_work
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE 
        ai.id = assessment_instance_id;
    
     -- get basic data about existing objects
    SELECT
        c.id,      g.id,   u.user_id,            a.id,          a.type,
        a.max_points,          ai.max_points,
        COALESCE(a.max_bonus_points, 0),    ai.max_bonus_points,
        ai.open
    INTO
        course_id, group_id,  user_id,   assessment_id, assessment_type,
        assessment_max_points, old_assessment_instance_max_points,
        assessment_max_bonus_points, old_assessment_instance_max_bonus_points,
        assessment_instance_open
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.deleted_at IS NULL)
        LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    WHERE
        ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'assessment_instance_update could not find assessment_instance_id: %', assessment_instance_id;
    END IF;
   
    
    IF NOT assessment_instance_open THEN RETURN; END IF; -- silently return without updating

    -- get new questions if any, insert them, and log it
    WITH
    inserted_instance_questions AS (
        INSERT INTO instance_questions AS iq
            (authn_user_id, assessment_instance_id, assessment_question_id, current_value, points_list, points_list_original)
        SELECT
             authn_user_id,
             assessment_instance_id,
             assessment_question_id,
             coalesce(aq.init_points, aq.points_list[1], 0),
             aq.points_list,
             aq.points_list
        FROM
            select_assessment_questions(assessment_id, assessment_instance_id) AS aq
        ON CONFLICT
            (assessment_question_id, assessment_instance_id) DO NOTHING
        RETURNING
            iq.*
    ),
    inserted_audit_logs AS (
        INSERT INTO audit_logs
            (authn_user_id, course_id, user_id, group_id,
            table_name,           row_id,
            action, new_state)
        SELECT
            authn_user_id, course_id, user_id, group_id,
            'instance_questions', iq.id,
            'insert', to_jsonb(iq.*)
        FROM
            inserted_instance_questions AS iq
    )
    SELECT coalesce(array_agg(iq.id), array[]::bigint[])
    INTO new_instance_question_ids
    FROM inserted_instance_questions AS iq;

    -- did we add any instance questions above?
    updated := updated OR (cardinality(new_instance_question_ids) > 0);

    SELECT sum(zmp.max_points)
    INTO zones_total_max_points
    FROM assessment_instances_points(assessment_instance_id) AS zmp;
    
    -- determine the correct max_points
    new_assessment_instance_max_points := COALESCE(assessment_max_points, GREATEST(zones_total_max_points - assessment_max_bonus_points, 0));

    -- ensure that max_bonus_points is not greater than the number of available points
    assessment_max_bonus_points := GREATEST(LEAST(assessment_max_bonus_points, zones_total_max_points - new_assessment_instance_max_points), 0);

    -- update max_points if necessary and log it
    IF new_assessment_instance_max_points IS DISTINCT FROM old_assessment_instance_max_points OR assessment_max_bonus_points IS DISTINCT FROM old_assessment_instance_max_bonus_points THEN
        updated := TRUE;

        UPDATE assessment_instances AS ai
        SET
            max_points = new_assessment_instance_max_points,
            max_bonus_points = assessment_max_bonus_points,
            modified_at = now()
        WHERE
            ai.id = assessment_instance_id;

        INSERT INTO audit_logs
            (authn_user_id, course_id, user_id, group_id,
            table_name,            column_name,  row_id,
            action,  old_state,
            new_state)
        VALUES
            (authn_user_id, course_id, user_id, group_id,
            'assessment_instances', 'max_points', assessment_instance_id,
            'update', jsonb_build_object('max_points', old_assessment_instance_max_points, 'max_bonus_points', old_assessment_instance_max_bonus_points),
            jsonb_build_object('max_points', new_assessment_instance_max_points, 'max_bonus_points', assessment_max_bonus_points));
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
