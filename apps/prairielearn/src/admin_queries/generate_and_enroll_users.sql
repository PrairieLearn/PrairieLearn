SELECT
  user_id,
  uid,
  name,
  c.id AS course_id,
  c.short_name AS course,
  ci.id AS course_instance_id,
  ci.short_name AS course_instance
FROM
  users_randomly_generate (
    $count::int,
    NULLIF($course_instance_id, '')::bigint
  )
  LEFT JOIN course_instances AS ci on (ci.id = NULLIF($course_instance_id, '')::bigint)
  LEFT JOIN pl_courses AS c ON (c.id = ci.course_id)
ORDER BY
  user_id;
