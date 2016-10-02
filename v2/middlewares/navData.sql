-- BLOCK nav_data
SELECT
    jsonb_build_object(
        'courses', all_courses($user_id),
        'course_instances', all_course_instances(c.id, $user_id)
    ) AS nav_data,
    to_json(c) AS course,
    to_json(ci) AS course_instance
FROM
    course_instances AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE
    ci.id = $course_instance_id;
