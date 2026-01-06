-- BLOCK select_course_instance_permission
SELECT
  cip.course_instance_role
FROM
  course_instance_permissions AS cip
  JOIN course_permissions AS cp ON cip.course_permission_id = cp.id
WHERE
  cip.course_instance_id = $course_instance_id
  AND cp.user_id = $user_id;
