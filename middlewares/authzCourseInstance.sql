-- BLOCK select_authz_data
SELECT
    authz_course_instance($authn_user_id, $course_instance_id, $is_administrator) AS permissions_course_instance,
    authz_course($authn_user_id, $course_id, $is_administrator) AS permissions_course,
    to_jsonb(c.*) AS course,
    to_jsonb(ci.*) AS course_instance
FROM
    course_instances AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE
    ci.id = $course_instance_id
    AND ci.deleted_at IS NULL;

-- BLOCK select_effective_authz_data
WITH effective_data AS (
    SELECT
        CASE
            WHEN $authn_role::enum_role >= 'TA' AND e.role <= $authn_role::enum_role THEN to_jsonb(u)
            ELSE to_jsonb(authn_u)
        END AS user,
        CASE
            WHEN $authn_role::enum_role >= 'TA' THEN least($authn_role::enum_role, $requested_role::enum_role)
            ELSE $authn_role::enum_role
        END AS role,
        CASE
            WHEN $requested_mode::enum_mode = 'Default' THEN $server_mode::enum_mode
            WHEN $authn_role::enum_role >= 'TA' THEN $requested_mode::enum_mode
            ELSE $server_mode::enum_mode
        END AS mode
    FROM
        users AS authn_u,
        users AS u
        JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = $course_instance_id)
    WHERE
        authn_u.id = $authn_user_id
        AND u.uid = $requested_uid
)
SELECT
    ed.*,
    (ed.role >= 'TA') AS has_instructor_view,
    (ed.role >= 'Instructor') AS has_instructor_edit
FROM
    effective_data AS ed
WHERE
    ed.role IS NOT NULL
    AND check_course_instance_access($course_instance_id, ed.role, ed.user->>'uid', current_timestamp);
