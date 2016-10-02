-- BLOCK select_authn_data
SELECT
    to_jsonb(e) AS enrollment,
    (e.role >= 'TA') AS authz_admin
FROM
    enrollments AS e
    JOIN users AS u ON (u.id = e.user_id)
WHERE
    u.id = $user_id
    AND e.course_instance_id = $course_instance_id
    AND check_course_instance_access($course_instance_id, e.role, u.uid, current_timestamp);

-- BLOCK select_effective_authz_data
WITH effective_data AS (
    SELECT
        CASE
            WHEN authn_e.role >= 'TA' AND e.role <= authn_e.role THEN to_jsonb(u)
            ELSE to_jsonb(authn_u)
        END AS user,
        CASE
            WHEN authn_e.role >= 'TA' THEN least(authn_e.role, e.role, $requested_role)
            ELSE authn_e.role
        END AS role,
        CASE
            WHEN $requested_mode = 'Default' THEN $server_mode
            WHEN authn_e.role >= 'TA' THEN $requested_mode
            ELSE $server_mode
        END AS mode
    FROM
        course_instances AS ci,
        users AS authn_u
        JOIN enrollments AS authn_e ON (authn_e.user_id = authn_u.id AND authn_e.course_instance_id = ci.id),
        users AS u
        JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = ci.id)
    WHERE
        ci.id = $course_instance_id
        AND authn_u.id = $authn_user_id
        AND u.uid = $requested_uid
)
SELECT
    ed.*,
    (ed.role >= 'TA') AS authz_admin
FROM
    effective_data AS ed
WHERE
    ed.role IS NOT NULL
    AND check_course_instance_access($course_instance_id, ed.role, ed.user.uid, current_timestamp);
