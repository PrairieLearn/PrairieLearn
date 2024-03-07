CREATE FUNCTION
    courses_update_column(
        course_id bigint,
        column_name text,
        value text,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    old_row pl_courses%ROWTYPE;
    new_row pl_courses%ROWTYPE;
BEGIN
    SELECT c.* INTO old_row
    FROM
        pl_courses AS c
    WHERE
        c.id = course_id
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such course, id: %', course_id;
    END IF;

    CASE column_name
        WHEN 'short_name' THEN
            UPDATE pl_courses AS c SET short_name = value
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        WHEN 'title' THEN
            UPDATE pl_courses AS c SET title = value
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        WHEN 'display_timezone' THEN
            UPDATE pl_courses AS c SET display_timezone = value
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        WHEN 'path' THEN
            UPDATE pl_courses AS c SET path = value
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        WHEN 'repository' THEN
            UPDATE pl_courses AS c SET repository = value
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        WHEN 'branch' THEN
            UPDATE pl_courses AS c SET branch = value
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        WHEN 'institution_id' THEN
            UPDATE pl_courses AS c SET institution_id = CAST(value AS BIGINT)
            WHERE c.id = course_id
            RETURNING c.* INTO new_row;
        ELSE
            RAISE EXCEPTION 'unknown column_name: %', column_name;
    END CASE;

    INSERT INTO audit_logs
        (authn_user_id, course_id,
        table_name, column_name, row_id,
        action,  parameters,
        old_state, new_state)
    VALUES
        (authn_user_id, course_id,
        'pl_courses',  column_name, course_id,
        'update', jsonb_build_object(column_name, value),
        to_jsonb(old_row), to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
