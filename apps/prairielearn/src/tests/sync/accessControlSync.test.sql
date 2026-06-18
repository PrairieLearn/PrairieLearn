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
  assessment_access_control_rules (
    assessment_id,
    before_release_listed,
    number,
    uuid,
    target_type,
    date_control_duration_minutes,
    date_control_duration_minutes_overridden
  )
VALUES
  (
    $assessment_id,
    true,
    $number,
    $uuid::uuid,
    'enrollment',
    $duration_minutes::integer,
    $duration_minutes::integer IS NOT null
  )
RETURNING
  id;

-- BLOCK insert_enrollment_target
INSERT INTO
  assessment_access_control_enrollments (assessment_access_control_rule_id, enrollment_id)
VALUES
  (
    $assessment_access_control_rule_id,
    $enrollment_id
  );

-- BLOCK insert_early_deadline
INSERT INTO
  assessment_access_control_early_deadlines (assessment_access_control_rule_id, date, credit)
VALUES
  (
    $assessment_access_control_rule_id,
    $date::timestamptz,
    $credit
  );

-- BLOCK insert_late_deadline
INSERT INTO
  assessment_access_control_late_deadlines (assessment_access_control_rule_id, date, credit)
VALUES
  (
    $assessment_access_control_rule_id,
    $date::timestamptz,
    $credit
  );

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
  assessment_access_control_student_labels (
    assessment_access_control_rule_id,
    student_label_id
  )
VALUES
  (
    $assessment_access_control_rule_id,
    $student_label_id
  );

-- BLOCK insert_pt_exam
INSERT INTO
  pt_exams (uuid, name)
VALUES
  ($uuid::uuid, 'Test Exam');
