CREATE FUNCTION
    course_instances_with_staff_access (
        IN user_id bigint,
        IN is_administrator boolean,
        IN course_id bigint,
        OUT course_instances jsonb
    )
AS $$
BEGIN
    -- returns a list of all course instances to which the user "has staff access":
    --
    --  if either the user is an administrator, the user has a non-None course role,
    --  or the course is the example course, then this means all course instances
    --
    --  otherwise, this means all course instances for which the user has a non-None
    --  course instance role
    --
    SELECT
        jsonb_agg(
            jsonb_build_object(
                'short_name', ci.short_name,
                'long_name', ci.long_name,
                'id', ci.id,
                'formatted_start_date', CASE
                    WHEN d.start_date IS NULL THEN '—'
                    ELSE format_date_full_compact(d.start_date, ci.display_timezone)
                END,
                'formatted_end_date', CASE
                    WHEN d.end_date IS NULL THEN '—'
                    ELSE format_date_full_compact(d.end_date, ci.display_timezone)
                END,
                'has_course_instance_permission_view',
                is_administrator OR cip.course_instance_role > 'None'
            ) ORDER BY d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC
        )
    INTO
        course_instances_with_staff_access.course_instances
    FROM
        pl_courses AS c
        JOIN course_instances AS ci ON (
            ci.course_id = c.id
            AND ci.deleted_at IS NULL
        )
        LEFT JOIN course_permissions AS cp ON (
            cp.user_id = course_instances_with_staff_access.user_id
            AND cp.course_id = course_instances_with_staff_access.course_id
        )
        LEFT JOIN course_instance_permissions AS cip ON (
            cip.course_permission_id = cp.id
            AND cip.course_instance_id = ci.id
        ),
        LATERAL (
            SELECT
                min(ar.start_date) AS start_date,
                max(ar.end_date) AS end_date
            FROM
                course_instance_access_rules AS ar
            WHERE
                ar.course_instance_id = ci.id
                AND ((ar.role > 'Student') IS NOT TRUE)
        ) AS d
    WHERE
        c.id = course_instances_with_staff_access.course_id
        AND c.deleted_at IS NULL
        AND (
            is_administrator
            OR cp.course_role > 'None'
            OR cip.course_instance_role > 'None'
            OR c.example_course IS TRUE
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
