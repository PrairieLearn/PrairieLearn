CREATE FUNCTION
    select_or_insert_course_by_path(
        IN path text,
        OUT course_id bigint
    )
AS $$
BEGIN
    SELECT INTO course_id
        last_value(c.id) OVER (ORDER BY id)
    FROM
        pl_courses AS c
    WHERE
        c.path = select_or_insert_course_by_path.path;

    IF NOT FOUND THEN
        INSERT INTO pl_courses AS c
            (path,  display_timezone, institution_id)
        SELECT path, i.display_timezone, i.id
        FROM institutions i
        WHERE i.id = 1
        RETURNING
            c.id INTO course_id;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql VOLATILE;
