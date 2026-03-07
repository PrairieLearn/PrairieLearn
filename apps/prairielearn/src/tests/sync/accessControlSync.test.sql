-- BLOCK insert_user
INSERT INTO
  users (uid, name, institution_id)
VALUES
  ($uid, $name, $institution_id)
RETURNING
  id;

-- BLOCK insert_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  )
VALUES
  ($user_id, $course_instance_id, $status, NOW())
RETURNING
  id;

-- BLOCK insert_enrollment_access_control_rule
INSERT INTO
  assessment_access_control (
    course_instance_id,
    assessment_id,
    enabled,
    block_access,
    list_before_release,
    "number",
    target_type,
    date_control_duration_minutes,
    date_control_duration_minutes_overridden
  )
VALUES
  (
    $course_instance_id,
    $assessment_id,
    true,
    false,
    true,
    $number,
    'enrollment',
    $duration_minutes::integer,
    $duration_minutes::integer IS NOT NULL
  )
RETURNING
  id;

-- BLOCK insert_enrollment_target
INSERT INTO
  assessment_access_control_enrollments (assessment_access_control_id, enrollment_id)
VALUES
  ($assessment_access_control_id, $enrollment_id);

-- BLOCK select_student_label_id
SELECT
  id
FROM
  student_labels
WHERE
  name = $name
  AND course_instance_id = $course_instance_id;

-- BLOCK insert_student_label_target
INSERT INTO
  assessment_access_control_student_labels (assessment_access_control_id, student_label_id)
VALUES
  ($assessment_access_control_id, $student_label_id);
