-- BLOCK get_requests
WITH
select_course_requests AS (
    SELECT
        coalesce(jsonb_agg(
            jsonb_build_object(
                'approval_status', r.approval_status,
                'short_name', r.short_name,
                'title', r.title,
                'institution', i.short_name)),
        '[]'::jsonb) AS course_requests
    FROM course_requests AS r
    INNER JOIN institutions AS i on r.institution_id = i.id
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
)
SELECT
    course_requests,
    institutions,
    default_institution
FROM
    select_course_requests,
    select_institutions,
    select_default_institution;

-- BLOCK insert_request
INSERT INTO course_requests(short_name, title, institution_id, user_id)
VALUES ($short_name, $title, $institution, $user_id);
