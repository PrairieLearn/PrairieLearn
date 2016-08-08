SELECT ci.*
FROM course_instances AS ci
WHERE ci.id = $course_instance_id
    AND ci.deleted_at IS NULL;
