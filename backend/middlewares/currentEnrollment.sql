SELECT
    e.*
FROM
    enrollments AS e
WHERE
    e.user_id = $user_id
    AND e.course_instance_id = $course_instance_id;
