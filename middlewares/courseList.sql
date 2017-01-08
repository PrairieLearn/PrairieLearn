WITH courses_with_instances
AS (
SELECT
    c.*, ci.id AS course_instance_id,
    row_number() OVER (PARTITION BY c.id ORDER BY ci.number DESC)
-- for each course, order by course_instances.number and number the rows
FROM
    enrollments AS e
    JOIN users AS u ON (u.user_id = e.user_id)
    JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE
    u.uid = $uid
    AND role >= 'TA'
    AND ci.deleted_at IS NULL
    )
SELECT * FROM courses_with_instances
WHERE row_number = 1;
-- only keep one row per course, which will be the one with the biggest course_instance.number
