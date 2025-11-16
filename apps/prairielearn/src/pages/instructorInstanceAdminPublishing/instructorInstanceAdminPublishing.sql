-- BLOCK course_instance_access_rules
SELECT
  ciar.*
FROM
  course_instance_access_rules AS ciar
WHERE
  ciar.course_instance_id = $course_instance_id
ORDER BY
  ciar.number;
