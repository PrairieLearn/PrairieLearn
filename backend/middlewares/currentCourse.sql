SELECT c.*
FROM course_instances AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE ci.id = $1
    AND ci.deleted_at IS NULL;
