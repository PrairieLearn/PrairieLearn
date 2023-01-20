SELECT
    u.user_id,
    u.uid,
    u.name,
    c.id AS course_id,
    c.short_name AS course,
    ci.id AS course_instance_id,
    ci.short_name AS course_instance,
    a.id AS assessment_id,
    a.title AS assessment,
    aii.assessment_instance_id
FROM
    assessments AS a
    JOIN course_instances AS ci on (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN enrollments AS e ON (e.course_instance_id = ci.id)
    JOIN users AS u ON (u.user_id = e.user_id)
    JOIN assessment_instances_insert(a.id, u.user_id, a.group_work, u.user_id, $mode) AS aii ON TRUE
WHERE
    a.id = $assessment_id
ORDER BY
    user_id;
