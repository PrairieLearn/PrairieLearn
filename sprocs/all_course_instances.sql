DROP FUNCTION IF EXISTS all_course_instances(integer);

CREATE OR REPLACE FUNCTION
    all_course_instances(
        user_id bigint
    ) RETURNS JSONB
AS $$
WITH course_instance_list AS (
    SELECT
        c.short_name AS course_short_name,
        c.title AS course_title,
        ci.*
    FROM
        users AS u
        JOIN enrollments AS e ON (e.user_id = u.id)
        JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
        JOIN courses AS c ON (c.id = ci.course_id)
    WHERE
        u.id = all_course_instances.user_id
        AND ci.deleted_at IS NULL
        AND check_course_instance_access(ci.id, e.role, u.uid, current_timestamp)
    ORDER BY
        c.id, ci.number DESC
)
SELECT
    jsonb_agg(to_jsonb(course_instance_list))
FROM
    course_instance_list;
$$ LANGUAGE SQL STABLE;
