-- BLOCK select_course_instances
SELECT
    ci.short_name,
    ci.id
FROM
    course_instances AS ci
    LEFT JOIN LATERAL authz_course_instance($user_id, ci.id, $is_administrator, $req_date) AS aci ON TRUE
WHERE
    ci.course_id = $course_id
    AND ci.deleted_at IS NULL
    AND (aci->>'has_instructor_view')::BOOLEAN
ORDER BY
    ci.number DESC, ci.id;
