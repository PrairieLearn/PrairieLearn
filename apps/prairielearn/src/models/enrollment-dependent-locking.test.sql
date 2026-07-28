-- BLOCK move_assessment_access_control_target
UPDATE assessment_access_control_enrollments
SET
  enrollment_id = $new_enrollment_id
WHERE
  enrollment_id = $old_enrollment_id
  AND assessment_access_control_rule_id = $rule_id;

-- BLOCK select_application_is_blocked
SELECT
  EXISTS (
    SELECT
      1
    FROM
      pg_stat_activity
    WHERE
      pid <> pg_backend_pid()
      AND application_name = $application_name
      AND cardinality(pg_blocking_pids(pid)) > 0
  );

-- BLOCK set_local_application_name
SELECT
  set_config('application_name', $application_name, true);
