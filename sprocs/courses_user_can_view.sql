CREATE OR REPLACE FUNCTION
    courses_user_can_view (
        IN user_id bigint,
        IN is_administrator boolean,
        OUT courses jsonb
    )
AS $$
BEGIN
    SELECT
        jsonb_agg(c.* ORDER BY c.short_name, c.title, c.id)
    INTO
        courses
    FROM
        pl_courses AS c
        JOIN authz_course(user_id, c.id, is_administrator) AS permissions_course ON TRUE
    WHERE
        c.deleted_at IS NULL
        AND (permissions_course->>'has_course_permission_view')::BOOLEAN IS TRUE;
END;
$$ LANGUAGE plpgsql VOLATILE;
