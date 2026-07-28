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

-- BLOCK count_waiting_enrollment_locks
SELECT
  count(*)::integer
FROM
  pg_stat_activity
WHERE
  pid <> pg_backend_pid()
  AND wait_event_type = 'Lock'
  AND query LIKE '%FOR UPDATE%';
