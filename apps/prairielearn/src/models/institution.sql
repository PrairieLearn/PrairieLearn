-- BLOCK select_institution_for_course_instance
SELECT
  i.*
FROM
  institutions AS i
  JOIN pl_courses AS c ON (c.institution_id = i.id)
  JOIN course_instances AS ci ON (ci.course_id = c.id)
WHERE
  ci.id = $course_instance_id;
