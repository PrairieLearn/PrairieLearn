-- BLOCK select_student_info
SELECT
  to_jsonb(e.*) AS enrollment,
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(u.*) AS user,
  users_get_displayed_role (u.user_id, $course_instance_id) AS role
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
  course_instance_id = $course_instance_id
  AND user_id = $user_id
  AND status = 'joined'
  AND NOT lti_managed;

-- BLOCK update_enrollment_unblock
UPDATE enrollments
SET
  status = 'joined',
  joined_at = COALESCE(joined_at, now())
WHERE
  course_instance_id = $course_instance_id
  AND user_id = $user_id
  AND status = 'blocked';

-- BLOCK delete_invitation_by_user_id
DELETE FROM enrollments
WHERE
  course_instance_id = $course_instance_id
  AND status = 'invited'
  AND pending_uid = $pending_uid;
