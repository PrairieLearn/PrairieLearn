SELECT DISTINCT other_ci.*
FROM course_instances AS ci
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN course_instances AS other_ci ON (other_ci.course_id = c.id)
WHERE ci.id = $course_instance_id
    AND ci.deleted_at IS NULL
ORDER BY other_ci.number DESC, other_ci.id;
