-- check that the requested question is in the current course
SELECT
    q.*
FROM
    questions AS q
    JOIN courses AS c ON (c.id = q.course_id)
    JOIN course_instances AS ci ON (ci.course_id = c.id)
WHERE
    q.id = $question_id
    AND ci.deleted_at IS NULL
    AND q.deleted_at IS NULL
    AND ci.id = $course_instance_id;
