CREATE OR REPLACE FUNCTION
    select_or_insert_course_by_path(
        IN path text,
        OUT course_id bigint
    )
AS $$
BEGIN
    SELECT INTO course_id
        last_value(c.id) OVER (ORDER BY id)
    FROM
        courses AS c
    WHERE
        c.path = select_or_insert_course_by_path.path;

    IF NOT FOUND THEN
        INSERT INTO courses AS c
            (path)
        VALUES
            (path)
        RETURNING
            c.id INTO course_id;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql VOLATILE;
