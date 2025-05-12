-- BLOCK check_course_instance_is_public
SELECT
  ci.share_source_publicly
FROM
  course_instances AS ci
WHERE
  ci.id = $course_instance_id;
