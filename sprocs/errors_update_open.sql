CREATE OR REPLACE FUNCTION
    errors_update_open (
        error_id bigint,
        new_open boolean,
        course_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    old_open boolean;
BEGIN
    SELECT e.open
    INTO old_open
    FROM errors AS e
    WHERE
        e.id = error_id
        AND e.course_caused
        AND e.course_id = errors_update_open.course_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'bad error_id % for course_id %', error_id, course_id; END IF;

    UPDATE errors AS e
    SET open = new_open
    WHERE e.id = error_id;

    INSERT INTO audit_logs
        (authn_user_id, course_id,
        table_name, column_name, row_id, action,
        parameters, old_state, new_state)
    VALUES
        (authn_user_id, course_id,
        'errors',  'open', error_id, 'update',
        jsonb_build_object('open', new_open),
        jsonb_build_object('open', old_open),
        jsonb_build_object('open', new_open));
END;
$$ LANGUAGE plpgsql VOLATILE;
