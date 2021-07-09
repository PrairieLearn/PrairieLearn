CREATE FUNCTION
    assessment_instances_delete_all(
        assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    course_instance_id bigint;
    course_id bigint;
BEGIN
    SELECT
        ci.id,              c.id
    INTO
        course_instance_id, course_id
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
        a.id = assessment_id;

    WITH deleted_assessment_instances AS (
        DELETE FROM assessment_instances AS ai
        WHERE
            ai.assessment_id = assessment_instances_delete_all.assessment_id
        RETURNING
            ai.*
    )
    INSERT INTO audit_logs
            (authn_user_id, course_id, course_instance_id, user_id, group_id,
            table_name,             row_id, action,  old_state)
    (
        SELECT
            authn_user_id,  course_id, course_instance_id, ai.user_id, ai.group_id,
            'assessment_instances', ai.id, 'delete', to_jsonb(ai.*)
        FROM
            deleted_assessment_instances AS ai
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
