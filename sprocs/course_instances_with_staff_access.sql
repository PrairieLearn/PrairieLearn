CREATE OR REPLACE FUNCTION
    course_instances_with_staff_access (
        IN user_id bigint,
        IN is_administrator boolean,
        IN course_id bigint,
        OUT course_instances jsonb
    )
AS $$
BEGIN
    SELECT
        jsonb_agg(ci.* ORDER BY d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC)
    INTO
        course_instances_with_staff_access.course_instances
    FROM
        pl_courses AS c
        JOIN authz_course(
                course_instances_with_staff_access.user_id,
                c.id,
                course_instances_with_staff_access.is_administrator
            ) AS permissions_course ON TRUE
        JOIN course_instances AS ci ON (ci.course_id = c.id AND ci.deleted_at IS NULL),
        LATERAL (SELECT min(ar.start_date) AS start_date, max(ar.end_date) AS end_date FROM course_instance_access_rules AS ar WHERE ar.course_instance_id = ci.id) AS d
    WHERE
        c.id = course_instances_with_staff_access.course_id
        AND c.deleted_at IS NULL
        AND (permissions_course->>'has_course_permission_preview')::BOOLEAN IS TRUE;
END;
$$ LANGUAGE plpgsql VOLATILE;
