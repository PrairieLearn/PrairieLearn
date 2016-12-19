DROP FUNCTION IF EXISTS all_courses(integer);

CREATE OR REPLACE FUNCTION
    all_courses (
        user_id integer
    ) RETURNS JSONB
AS $$
WITH course_list AS (
    SELECT DISTINCT ON (id)
        c.*,
        ci.id AS course_instance_id
    FROM
        users AS u
        JOIN enrollments AS e ON (e.user_id = u.id)
        JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
        JOIN courses AS c ON (c.id = ci.course_id)
    WHERE
        u.id = all_courses.user_id
        AND ci.deleted_at IS NULL
        AND check_course_instance_access(ci.id, e.role, u.uid, current_timestamp)
    ORDER BY
        c.id, ci.number DESC
)
SELECT
    jsonb_agg(to_jsonb(course_list))
FROM
    course_list;
$$ LANGUAGE SQL;
