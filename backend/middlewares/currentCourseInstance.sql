SELECT ci.*
FROM course_instances AS ci
WHERE ci.id = $1
    AND ci.deleted_at IS NULL;
