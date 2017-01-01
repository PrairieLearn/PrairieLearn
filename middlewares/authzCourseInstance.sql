-- BLOCK select_authz_data
SELECT
    e.role AS authn_role,
    (e.role >= 'TA') AS authn_has_instructor_view,
    (e.role >= 'Instructor') AS authn_has_instructor_edit,
    to_jsonb(c.*) AS course,
    to_jsonb(ci.*) AS course_instance
FROM
    enrollments AS e
    JOIN users AS u ON (u.id = e.user_id)
    JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE
    u.id = $authn_user_id
    AND ci.id = $course_instance_id
    AND ci.deleted_at IS NULL
    AND check_course_instance_access($course_instance_id, e.role, u.uid, current_timestamp);

-- BLOCK select_effective_authz_data
WITH effective_data AS (
    SELECT
        CASE
            WHEN authn_e.role >= 'TA' AND e.role <= authn_e.role THEN to_jsonb(u)
            ELSE to_jsonb(authn_u)
        END AS user,
        CASE
            WHEN authn_e.role >= 'TA' THEN least(authn_e.role, $requested_role)
            ELSE authn_e.role
        END AS role,
        CASE
            WHEN $requested_mode = 'Default' THEN $server_mode
            WHEN authn_e.role >= 'TA' THEN $requested_mode
            ELSE $server_mode
        END AS mode
    FROM
        users AS authn_u
        JOIN enrollments AS authn_e ON (authn_e.user_id = authn_u.id AND authn_e.course_instance_id = $course_instance_id),
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
