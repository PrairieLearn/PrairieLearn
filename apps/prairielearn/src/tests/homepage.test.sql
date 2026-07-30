-- BLOCK create_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    pending_uid,
    pending_uin,
    first_joined_at
  )
VALUES
  (
    $user_id,
    $course_instance_id,
    $status,
    $pending_uid,
    $pending_uin,
    $first_joined_at
  )
RETURNING
  *;

-- BLOCK delete_enrollment_by_id
DELETE FROM enrollments
WHERE
  id = $enrollment_id;

-- BLOCK select_enrollments_by_ids
SELECT
  *
FROM
  enrollments
WHERE
  id = ANY ($enrollment_ids::bigint[])
ORDER BY
  id;

-- BLOCK count_enrollment_audit_events
SELECT
  count(*)::integer
FROM
  audit_events
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[]);

-- BLOCK create_publishing_extension
INSERT INTO
  course_instance_publishing_extensions (course_instance_id, name, end_date)
VALUES
  ($course_instance_id, $name, $end_date)
RETURNING
  *;

-- BLOCK add_publishing_extension_enrollment
INSERT INTO
  course_instance_publishing_extension_enrollments (
    course_instance_publishing_extension_id,
    enrollment_id
  )
VALUES
  ($publishing_extension_id, $enrollment_id);

-- BLOCK delete_publishing_extension
DELETE FROM course_instance_publishing_extensions
WHERE
  id = $publishing_extension_id;

-- BLOCK update_course_instance_publishing
UPDATE course_instances
SET
  publishing_start_date = $publishing_start_date,
  publishing_end_date = $publishing_end_date
WHERE
  id = $course_instance_id;

-- BLOCK create_unrestricted_access_rule
INSERT INTO
  course_instance_access_rules (course_instance_id, number, institution)
SELECT
  $course_instance_id,
  coalesce(max(number), 0) + 1,
  'Any'
FROM
  course_instance_access_rules
WHERE
  course_instance_id = $course_instance_id
RETURNING
  id;

-- BLOCK delete_access_rule
DELETE FROM course_instance_access_rules
WHERE
  id = $access_rule_id;

-- BLOCK update_modern_publishing
UPDATE course_instances
SET
  modern_publishing = $modern_publishing
WHERE
  id = $course_instance_id;
