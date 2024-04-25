-- BLOCK select_assessment_id_from_uuid
SELECT
  a.id AS assessment_id
FROM
  assessments AS a
WHERE
  a.uuid = $uuid
  AND a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;

-- BLOCK tids
SELECT
  a.tid AS tid
FROM
  assessments AS a
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;
