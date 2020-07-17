-- BLOCK get_requests
WITH
select_course_requests AS (
    SELECT
        coalesce(jsonb_agg(
            jsonb_build_object(
                'status', r.approved_status,
                'details',
                    CASE
                        WHEN r.approved_status = 'approved' THEN CONCAT('Approved by ', u.name)
                        WHEN r.approved_status = 'denied'   THEN CONCAT('Denied by ', u.name)
                        ELSE ''
                    END,
                'short_name', r.short_name,
                'title', r.title)),
        '[]'::jsonb) AS course_requests
    FROM course_requests AS r
    LEFT JOIN users as u on r.approved_by = u.user_id
    WHERE r.user_id = $user_id
),
select_has_at_least_one_course AS (
    SELECT (EXISTS (
       SELECT TRUE FROM course_requests AS cr
       WHERE cr.user_id = $user_id AND cr.approved_status = 'pending'
    )) AS has_one_course
)
SELECT
    course_requests,
    has_one_course
FROM
    select_course_requests,
    select_has_at_least_one_course;

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
