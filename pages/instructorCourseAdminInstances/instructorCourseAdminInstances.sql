-- BLOCK select_course_instances
SELECT
    ci.short_name,
    ci.long_name,
    ci.id,
    CASE
        WHEN d.start_date IS NULL THEN '—'
        ELSE format_date_full_compact(d.start_date, ci.display_timezone)
    END AS formatted_start_date,
    CASE
        WHEN d.end_date IS NULL THEN '—'
        ELSE format_date_full_compact(d.end_date, ci.display_timezone)
    END AS formatted_end_date,
    count(e.user_id) AS number
FROM
    course_instances AS ci
    LEFT JOIN enrollments AS e ON (e.course_instance_id = ci.id) AND (e.role = 'Student')
    LEFT JOIN LATERAL authz_course_instance($user_id, ci.id, $is_administrator, $req_date) AS aci ON TRUE,
    LATERAL (SELECT min(ar.start_date) AS start_date, max(ar.end_date) AS end_date FROM course_instance_access_rules AS ar WHERE ar.course_instance_id = ci.id) AS d
WHERE
    ci.course_id = $course_id
    AND ci.deleted_at IS NULL
    AND (aci->>'has_instructor_view')::BOOLEAN
GROUP BY
    ci.id,
    d.start_date,
    d.end_date
ORDER BY
    d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC;

-- BLOCK select_course_instance_id_from_uuid
SELECT
    ci.id AS course_instance_id
FROM
    course_instances AS ci
WHERE
    ci.uuid = $uuid
    AND ci.course_id = $course_id
    AND ci.deleted_at IS NULL;
