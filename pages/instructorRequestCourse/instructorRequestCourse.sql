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

-- BLOCK insert_request
INSERT INTO course_requests(short_name, title, user_id, github_user)
VALUES ($short_name, $title, $user_id, $github_user);

-- BLOCK can_auto_create_course
SELECT
    EXISTS (SELECT TRUE FROM course_permissions WHERE user_id = $user_id AND (course_role = 'Owner' OR course_role = 'Editor')) AS is_editor
    AND (count(*) < 5)
FROM course_requests AS cr
WHERE cr.user_id = $user_id AND cr.created_at BETWEEN NOW() - INTERVAL '24 HOURS' AND NOW();
