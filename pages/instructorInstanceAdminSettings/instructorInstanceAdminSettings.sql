-- BLOCK course_instance_stat
SELECT
    count(e.user_id) AS number
FROM
    enrollments AS e
WHERE
    e.course_instance_id = $course_instance_id
    AND e.role = 'Student';

-- BLOCK short_names
SELECT
    array_agg(ci.short_name) AS short_names
FROM
    course_instances AS ci
WHERE
    ci.course_id = $course_id
    AND ci.deleted_at IS NULL;

-- BLOCK select_course_instance_id_from_uuid
SELECT
    ci.id AS course_instance_id
FROM
    course_instances AS ci
WHERE
    /* vulnerable to injection attack unless we know the uuid is valid */
    ci.uuid = $uuid
    AND ci.course_id = $course_id
    AND ci.deleted_at IS NULL;
