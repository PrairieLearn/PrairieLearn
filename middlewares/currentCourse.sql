SELECT c.*
FROM course_instances AS ci
    JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE ci.id = $course_instance_id
    AND ci.deleted_at IS NULL;
