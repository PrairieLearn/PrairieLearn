CREATE FUNCTION
    courses_with_staff_access (
        IN user_id bigint,
        IN is_administrator boolean,
        OUT courses jsonb
    )
AS $$
BEGIN
    -- returns a list of courses that are either example courses or are courses
    -- in which the user has a non-None course role
    SELECT
        jsonb_agg(to_jsonb(c) || jsonb_build_object('permissions_course', permissions_course) ORDER BY c.short_name, c.title, c.id)
    INTO
        courses
    FROM
        pl_courses AS c
        JOIN authz_course(user_id, c.id, is_administrator, TRUE) AS permissions_course ON TRUE
    WHERE
        c.deleted_at IS NULL
        AND (
            (permissions_course->>'course_role')::enum_course_role > 'None'
            OR c.example_course IS TRUE
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
