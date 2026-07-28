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

-- BLOCK select_publishing_extension_enrollment_id
SELECT
  id
FROM
  course_instance_publishing_extension_enrollments
WHERE
  enrollment_id = $enrollment_id
  AND course_instance_publishing_extension_id = $publishing_extension_id;

-- BLOCK select_publishing_extension_id
SELECT
  id
FROM
  course_instance_publishing_extensions
WHERE
  id = $publishing_extension_id;

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

-- BLOCK select_assessment_access_control_enrollment_id
SELECT
  id
FROM
  assessment_access_control_enrollments
WHERE
  enrollment_id = $enrollment_id
  AND assessment_access_control_rule_id = $rule_id;

-- BLOCK select_audit_event_sequence_value
SELECT
  last_value::text
FROM
  audit_events_id_seq;

-- BLOCK lock_enrollment
SELECT
  id
FROM
  enrollments
WHERE
  id = $enrollment_id
FOR UPDATE;

-- BLOCK lock_publishing_extension_enrollment
SELECT
  id
FROM
  course_instance_publishing_extension_enrollments
WHERE
  id = $id
FOR UPDATE;

-- BLOCK lock_assessment_access_control_enrollment
SELECT
  id
FROM
  assessment_access_control_enrollments
WHERE
  id = $id
FOR UPDATE;

-- BLOCK delete_enrollment
DELETE FROM enrollments
WHERE
  id = $enrollment_id;

-- BLOCK block_enrollment_for_user
UPDATE enrollments
SET
  first_joined_at = CURRENT_TIMESTAMP,
  pending_email = NULL,
  pending_lti13_course_instance_id = NULL,
  pending_lti13_sub = NULL,
  pending_name = NULL,
  pending_uid = NULL,
  pending_uin = NULL,
  status = 'blocked',
  user_id = $user_id
WHERE
  id = $enrollment_id;

-- BLOCK set_local_application_name
SELECT
  set_config('application_name', $application_name, true);

-- BLOCK select_waiting_application_lock
SELECT
  1
FROM
  pg_stat_activity
WHERE
  pid <> pg_backend_pid()
  AND application_name = $application_name
  AND wait_event_type = 'Lock'
  AND query LIKE $query_pattern
LIMIT
  1;
