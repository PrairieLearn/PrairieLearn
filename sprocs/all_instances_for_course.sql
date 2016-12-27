DROP FUNCTION IF EXISTS all_instances_for_course(integer,integer);

CREATE OR REPLACE FUNCTION
    all_instances_for_course(
        course_id bigint,
        user_id bigint
    ) RETURNS JSONB
AS $$
WITH course_instance_list AS (
    SELECT
        ci.*
    FROM
        users AS u
        JOIN enrollments AS e ON (e.user_id = u.id)
        JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    WHERE
        u.id = all_instances_for_course.user_id
        AND ci.course_id = all_instances_for_course.course_id
        AND ci.deleted_at IS NULL
        AND check_course_instance_access(ci.id, e.role, u.uid, current_timestamp)
    ORDER BY
        ci.number DESC, ci.id
)
SELECT
    jsonb_agg(to_jsonb(course_instance_list))
FROM
    course_instance_list;
$$ LANGUAGE SQL;
