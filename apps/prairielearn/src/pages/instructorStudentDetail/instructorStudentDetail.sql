-- BLOCK select_student_info
SELECT
  to_jsonb(e.*) AS enrollment,
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(u.*) AS user,
  users_get_displayed_role (u.user_id, ci.id) AS role
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
  -- We don't join on pending_uid because we don't want to leak PII.
  LEFT JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  e.id = $enrollment_id;

-- BLOCK update_enrollment_block
UPDATE enrollments
SET
  status = 'blocked'
WHERE
  id = $enrollment_id
  AND course_instance_id = $course_instance_id
  AND status = 'joined';

-- BLOCK update_enrollment_unblock
UPDATE enrollments
SET
  status = 'joined'
WHERE
  id = $enrollment_id
  AND course_instance_id = $course_instance_id
  AND status = 'blocked';

-- BLOCK delete_invitation
DELETE FROM enrollments
WHERE
  id = $enrollment_id
  AND course_instance_id = $course_instance_id
  AND status = 'invited';
