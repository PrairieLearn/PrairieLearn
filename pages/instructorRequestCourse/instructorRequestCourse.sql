-- BLOCK get_requests
SELECT
    r.approved_status AS status,
    r.short_name,
    r.title,
    CASE
        WHEN r.approved_status = 'approved' THEN (
            CASE -- If the request was auto-approved, there wont be an approver
                WHEN r.approved_by IS NULL THEN 'Automatically approved'
                ELSE CONCAT('Approved by ', u.name)
            END)
        WHEN r.approved_status = 'denied'   THEN CONCAT('Denied by ', u.name)
        ELSE ''
    END AS details
FROM course_requests AS r
LEFT JOIN users as u on r.approved_by = u.user_id
WHERE r.user_id = $user_id
ORDER BY created_at DESC;

-- BLOCK get_existing_course_requests
SELECT EXISTS(
    SELECT cr.* FROM course_requests AS cr
    WHERE cr.user_id = $user_id AND LOWER(BTRIM(cr.short_name)) = LOWER(BTRIM($short_name))
) AS has_existing_request;

-- BLOCK get_conflicting_course_owners
WITH select_conflicting_courses AS (
    SELECT c.id
    FROM pl_courses AS c
    WHERE LOWER(BTRIM(c.short_name)) = $short_name
    LIMIT 1
)
SELECT u.name, u.uid
FROM select_conflicting_courses as cc
LEFT JOIN course_permissions AS cp ON (cc.id = cp.course_id AND cp.course_role = 'Owner')
LEFT JOIN users AS u ON u.user_id = cp.user_id;

-- BLOCK get_existing_owner_course_settings
SELECT co.institution_id, co.display_timezone
FROM course_permissions AS cp
JOIN pl_courses AS co ON co.id = cp.course_id
WHERE (cp.user_id = $user_id AND (cp.course_role = 'Owner' OR cp.course_role = 'Editor'))
LIMIT 1;
