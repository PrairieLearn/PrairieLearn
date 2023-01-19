CREATE FUNCTION
    assessment_instances_delete(
        assessment_instance_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    old_row assessment_instances%ROWTYPE;
    user_id bigint;
    group_id bigint;
    course_instance_id bigint;
    course_id bigint;
BEGIN
    SELECT
        ai.user_id, ai.group_id,              ci.id,      c.id
    INTO
        user_id,       group_id, course_instance_id, course_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
        ai.id = assessment_instance_id;

    DELETE FROM assessment_instances AS ai
    WHERE
        ai.id = assessment_instance_id
    RETURNING
        ai.* INTO old_row;
        
    INSERT INTO audit_logs
        (authn_user_id, course_id, course_instance_id, user_id, group_id,
        table_name,             row_id,
        action,  old_state)
    VALUES
        (authn_user_id, course_id, course_instance_id, user_id, group_id,
        'assessment_instances', old_row.id,
        'delete', to_jsonb(old_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
