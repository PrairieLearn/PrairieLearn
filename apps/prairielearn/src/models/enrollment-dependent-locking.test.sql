-- BLOCK set_short_lock_timeout
SET
  LOCAL lock_timeout = '100ms';

-- BLOCK lock_enrollment_for_no_key_update
SELECT
  id
FROM
  enrollments
WHERE
  id = $enrollment_id
FOR NO KEY UPDATE;

-- BLOCK move_assessment_access_control_target
UPDATE assessment_access_control_enrollments
SET
  enrollment_id = $new_enrollment_id
WHERE
  enrollment_id = $old_enrollment_id
  AND assessment_access_control_rule_id = $rule_id;

-- BLOCK select_waiting_enrollment_lock
SELECT
  query_start::text
FROM
  pg_stat_activity
WHERE
  pid <> pg_backend_pid()
  AND application_name = $application_name
  AND wait_event_type = 'Lock'
  AND query LIKE '%lock_enrollments_by_id%'
LIMIT
  1;

-- BLOCK select_later_waiting_enrollment_lock
SELECT
  query_start::text
FROM
  pg_stat_activity
WHERE
  pid <> pg_backend_pid()
  AND application_name = $application_name
  AND wait_event_type = 'Lock'
  AND query LIKE '%lock_enrollments_by_id%'
  AND query_start > $after_query_start::timestamptz
LIMIT
  1;

-- BLOCK set_local_application_name
SELECT
  set_config('application_name', $application_name, true);
