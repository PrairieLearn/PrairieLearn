DROP FUNCTION all_course_instances(integer, integer);

CREATE OR REPLACE FUNCTION
    all_course_instances(
        course_id integer,
        user_id integer
    ) RETURNS JSONB
AS $$
WITH course_instance_list AS (
    SELECT
        ci.*
    FROM
        course_instances AS ci
        JOIN enrollments AS e ON (e.course_instance_id = ci.id AND e.user_id = all_course_instances.user_id)
    WHERE
        ci.course_id = all_course_instances.course_id
        AND ci.deleted_at IS NULL
        AND e.role >= 'TA'
    ORDER BY
        ci.number DESC, ci.id
)
SELECT
    jsonb_agg(to_jsonb(course_instance_list))
FROM
    course_instance_list;
$$ LANGUAGE SQL;
