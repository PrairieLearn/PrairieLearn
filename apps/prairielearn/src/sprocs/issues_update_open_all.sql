CREATE FUNCTION
    issues_update_open_all (
        new_open boolean,
        course_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    old_open boolean;
BEGIN
    WITH updated_issues AS (
        UPDATE issues AS e
        SET open = new_open
        WHERE
            e.course_id = issues_update_open_all.course_id
            AND e.course_caused
            AND e.open IS DISTINCT FROM new_open
        RETURNING e.id, e.open
    )
    INSERT INTO audit_logs
        (authn_user_id, course_id,
        table_name, column_name, row_id, action,
        parameters, new_state)
    SELECT
        authn_user_id, course_id,
        'issues',  'open', e.id, 'update',
        jsonb_build_object('course_id', course_id),
        jsonb_build_object('open', e.open)
    FROM updated_issues AS e;
END;
$$ LANGUAGE plpgsql VOLATILE;
