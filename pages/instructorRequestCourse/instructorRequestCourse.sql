-- BLOCK get_requests
WITH
select_course_requests AS (
    SELECT
        coalesce(jsonb_agg(
            jsonb_build_object(
                'status', r.approved_status,
                'details',
                    CASE
                        WHEN r.approved_status = 'approved' THEN CONCAT('Approved by ', u_app.name)
                        WHEN r.approved_status = 'denied'   THEN CONCAT('Denied by ', u_app.name)
                        ELSE ''
                    END,
                'short_name', r.short_name,
                'title', r.title,
                'institution', i.short_name)),
        '[]'::jsonb) AS course_requests
    FROM course_requests AS r
    LEFT JOIN institutions AS i on r.institution_id = i.id
    LEFT JOIN administrators as a_app on r.approved_by = a_app.id
    LEFT JOIN users as u_app on a_app.user_id = u_app.user_id
    WHERE r.user_id = $user_id
),
select_institutions AS (
    SELECT
        coalesce(jsonb_agg(
            jsonb_build_object(
                'id', i.id,
                'short_name', i.short_name
            )),
        '[]'::jsonb) AS institutions
    FROM institutions as i
),
select_default_institution AS (
    SELECT i.id AS default_institution
    FROM users AS u
    INNER JOIN institutions AS i ON u.institution_id = i.id
    WHERE u.user_id = $user_id
    LIMIT 1
),
select_has_at_least_one_course AS (
    SELECT (EXISTS (
       SELECT TRUE FROM course_requests as cr
       WHERE cr.user_id = $user_id AND (cr.approved_status = 'pending' OR cr.approved_status = 'approved')
    )) AS has_one_course
)
SELECT
    course_requests,
    institutions,
    default_institution,
    has_one_course
FROM
    select_course_requests,
    select_institutions,
    select_default_institution,
    select_has_at_least_one_course;

-- BLOCK insert_request
INSERT INTO course_requests(short_name, title, institution_id, user_id, github_user)
VALUES ($short_name, $title, $institution, $user_id, $github_user);
