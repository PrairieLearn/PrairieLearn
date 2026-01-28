-- BLOCK delete_enrollment_rule
DELETE FROM assessment_access_control
WHERE
  id = $id
  AND target_type = 'enrollment';

-- BLOCK select_enrollment_ids_by_uids
SELECT
  e.id
FROM
  enrollments e
  JOIN users u ON u.id = e.user_id
WHERE
  u.uid = ANY ($uids)
  AND e.course_instance_id = $course_instance_id;
