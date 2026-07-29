-- BLOCK insert_student_label
INSERT INTO
  student_labels (course_instance_id, name, color, uuid)
VALUES
  ($course_instance_id, $name, 'blue1', $uuid)
RETURNING
  *;

-- BLOCK insert_student_label_enrollment
INSERT INTO
  student_label_enrollments (enrollment_id, student_label_id)
VALUES
  ($enrollment_id, $student_label_id)
ON CONFLICT (enrollment_id, student_label_id) DO NOTHING;

-- BLOCK select_student_label_ids
SELECT
  student_label_id AS id
FROM
  student_label_enrollments
WHERE
  enrollment_id = $enrollment_id
ORDER BY
  student_label_id;

-- BLOCK insert_publishing_extension
INSERT INTO
  course_instance_publishing_extensions (course_instance_id, name, end_date)
VALUES
  ($course_instance_id, $name, $end_date)
RETURNING
  *;

-- BLOCK insert_publishing_extension_enrollment
INSERT INTO
  course_instance_publishing_extension_enrollments (
    enrollment_id,
    course_instance_publishing_extension_id
  )
VALUES
  ($enrollment_id, $publishing_extension_id);

-- BLOCK select_publishing_extension_ids
SELECT
  course_instance_publishing_extension_id AS id
FROM
  course_instance_publishing_extension_enrollments
WHERE
  enrollment_id = $enrollment_id
ORDER BY
  course_instance_publishing_extension_id;

-- BLOCK insert_assessment_access_control_rule
INSERT INTO
  assessment_access_control_rules (assessment_id, number, target_type, uuid)
VALUES
  ($assessment_id, $number, 'enrollment', $uuid)
RETURNING
  *;

-- BLOCK insert_assessment_access_control_enrollment
INSERT INTO
  assessment_access_control_enrollments (assessment_access_control_rule_id, enrollment_id)
VALUES
  ($rule_id, $enrollment_id)
ON CONFLICT (assessment_access_control_rule_id, enrollment_id) DO NOTHING;

-- BLOCK select_assessment_access_control_rule_ids
SELECT
  assessment_access_control_rule_id AS id
FROM
  assessment_access_control_enrollments
WHERE
  enrollment_id = $enrollment_id
ORDER BY
  assessment_access_control_rule_id;

-- BLOCK lock_enrollment
SELECT
  id
FROM
  enrollments
WHERE
  id = $enrollment_id
FOR UPDATE;

-- BLOCK delete_enrollment
DELETE FROM enrollments
WHERE
  id = $enrollment_id;

-- BLOCK select_backend_pid
SELECT
  pg_backend_pid();

-- BLOCK select_waiting_backend_lock
SELECT
  1
FROM
  pg_stat_activity
WHERE
  pid = $backend_pid
  AND wait_event_type = 'Lock'
  AND query LIKE $query_pattern
LIMIT
  1;
