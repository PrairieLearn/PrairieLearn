-- BLOCK select_assessment_ids_from_uuids
SELECT
  a.id
FROM
  assessments AS a
WHERE
  a.uuid = ANY ($uuids::uuid[])
  AND a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;
