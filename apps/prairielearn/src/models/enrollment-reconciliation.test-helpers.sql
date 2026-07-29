-- BLOCK insert_user
INSERT INTO
  users (uid, name, uin, email, institution_id)
VALUES
  (
    $uid,
    $name,
    $uin,
    $email,
    COALESCE($institution_id, 1)
  )
RETURNING
  *;

-- BLOCK insert_enrollment
INSERT INTO
  enrollments (
    course_instance_id,
    first_joined_at,
    is_guest,
    pending_email,
    pending_lti13_course_instance_id,
    pending_lti13_sub,
    pending_name,
    pending_uid,
    pending_uin,
    status,
    user_id
  )
VALUES
  (
    $course_instance_id,
    $first_joined_at,
    $is_guest,
    $pending_email,
    $pending_lti13_course_instance_id,
    $pending_lti13_sub,
    $pending_name,
    $pending_uid,
    $pending_uin,
    $status,
    $user_id
  )
RETURNING
  *;

-- BLOCK select_enrollments_by_ids
SELECT
  *
FROM
  enrollments
WHERE
  id = ANY ($enrollment_ids::bigint[])
ORDER BY
  id;

-- BLOCK insert_lti13_course_instance
INSERT INTO
  lti13_course_instances (course_instance_id, deployment_id, context_id)
VALUES
  ($course_instance_id, $deployment_id, $context_id)
RETURNING
  *;
