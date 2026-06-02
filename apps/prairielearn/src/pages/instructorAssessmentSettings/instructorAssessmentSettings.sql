-- BLOCK tids
SELECT
  a.tid
FROM
  assessments AS a
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;
