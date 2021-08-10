-- BLOCK select_authz_data
SELECT
    coalesce($req_mode, ip_to_mode($ip, $req_date, $user_id)) AS mode,
    to_jsonb(c.*) AS course,
    to_jsonb(ci.*) AS course_instance,
    permissions_course.*,
    permissions_course_instance.*,
    courses_with_staff_access($user_id, $is_administrator) AS courses,
    course_instances_with_staff_access($user_id, $is_administrator, coalesce($course_id, ci.course_id)) AS course_instances
FROM
    pl_courses AS c
    LEFT JOIN course_instances AS ci ON (c.id = ci.course_id) AND (ci.id = $course_instance_id) AND (ci.deleted_at IS NULL)
    JOIN LATERAL authz_course($user_id, c.id, $is_administrator, $allow_example_course_override, $req_course_role) AS permissions_course ON TRUE
    JOIN LATERAL authz_course_instance($user_id, ci.id, $is_administrator, $req_date, TRUE, $req_course_instance_role) AS permissions_course_instance ON TRUE
WHERE
    c.id = coalesce($course_id, ci.course_id)
    AND c.deleted_at IS NULL
    AND (
        (permissions_course->>'course_role')::enum_course_role > 'None'
        OR (permissions_course_instance->>'course_instance_role')::enum_course_instance_role > 'None'
        OR (permissions_course_instance->>'has_student_access_with_enrollment')::boolean IS TRUE
    );

-- BLOCK ensure_enrollment
INSERT INTO enrollments
        (course_instance_id,  user_id)
VALUES ($course_instance_id, $user_id)
ON CONFLICT DO NOTHING;

-- BLOCK select_user
SELECT
    to_jsonb(u) AS user,
    to_jsonb(i) AS institution,
    (adm.id IS NOT NULL) AS is_administrator,
    users_is_instructor_in_course_instance(u.user_id, $course_instance_id) AS is_instructor
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
    JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
    u.uid = $uid;
