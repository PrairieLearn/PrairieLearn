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
    ci.uuid = $uuid
    AND ci.course_id = $course_id
    AND ci.deleted_at IS NULL;
