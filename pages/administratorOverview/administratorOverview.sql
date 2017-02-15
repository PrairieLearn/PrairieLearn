-- BLOCK select
WITH
select_administrator_users AS (
    SELECT
        coalesce(
            jsonb_agg(to_json(u) ORDER BY u.uid, u.user_id),
            '[]'::jsonb
        ) AS administrator_users
    FROM
        administrators AS adm
        JOIN users AS u ON (u.user_id = adm.user_id)
),
select_courses AS (
    SELECT
        coalesce(
            jsonb_agg(to_json(c) ORDER BY c.short_name, c.title, c.id),
            '[]'::jsonb
        ) AS courses
    FROM
        pl_courses AS c
    WHERE
        c.deleted_at IS NULL
)
SELECT
    select_administrator_users.administrator_users,
    select_courses.courses
FROM
    select_administrator_users,
    select_courses;

-- BLOCK select_course
SELECT * FROM pl_courses WHERE id = $course_id;
