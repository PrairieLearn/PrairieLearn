-- BLOCK create_enrollment_with_status
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    pending_uid,
    first_joined_at
  )
VALUES
  (
    $user_id,
    $course_instance_id,
    $status,
    $pending_uid,
    $first_joined_at
  )
RETURNING
  *;

-- BLOCK delete_enrollment_by_course_instance_and_user
DELETE FROM enrollments
WHERE
  course_instance_id = $course_instance_id
  AND user_id = $user_id;

-- BLOCK delete_enrollment_by_course_instance_and_pending_uid
DELETE FROM enrollments
WHERE
  course_instance_id = $course_instance_id
  AND pending_uid = $pending_uid;
