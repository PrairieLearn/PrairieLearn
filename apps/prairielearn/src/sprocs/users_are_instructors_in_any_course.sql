CREATE FUNCTION
    users_are_instructors_in_any_course () RETURNS TABLE (
        user_id bigint,
        is_instructor boolean
    )
AS $$
BEGIN
    -- returns a table with a row for each user that has two columns, one
    -- with the user_id and one with a flag is_instructor that is TRUE if
    -- the user is on the course staff of any course
    RETURN QUERY
        SELECT
            u.user_id,
            bool_or(
                adm.id IS NOT NULL
                OR (
                    (cp.course_role > 'None' OR cip.course_instance_role > 'None')
                    AND (c.deleted_at IS NULL AND ci.deleted_at IS NULL)
                )
            ) AS is_instructor
        FROM
            users AS u
            LEFT JOIN administrators AS adm ON adm.user_id = u.user_id
            LEFT JOIN course_permissions AS cp ON (cp.user_id = u.user_id)
            LEFT JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id)
            LEFT JOIN pl_courses AS c ON (c.id = cp.course_id)
            LEFT JOIN course_instances AS ci ON (ci.id = cip.course_instance_id AND ci.course_id = c.id)
        GROUP BY
            u.user_id;
END;
$$ LANGUAGE plpgsql STABLE;
