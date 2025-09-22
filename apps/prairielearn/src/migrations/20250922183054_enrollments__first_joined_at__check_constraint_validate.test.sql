-- BLOCK insert_course_instance
INSERT INTO
  course_instances (course_id, display_timezone, enrollment_code)
VALUES
  ($course_id, $display_timezone, 'BLABLABLAH')
RETURNING
  id;

-- BLOCK insert_user
INSERT INTO
  users (uid, name, uin, email, institution_id)
VALUES
  ($uid, $name, $uin, $email, $institution_id)
RETURNING
  *;

-- BLOCK enroll_user
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    created_at,
    first_joined_at,
    pending_uid
  )
VALUES
  (
    $user_id,
    $course_instance_id,
    $status,
    $created_at,
    $first_joined_at,
    $pending_uid
  )
ON CONFLICT DO NOTHING
RETURNING
  *;
