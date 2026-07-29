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
