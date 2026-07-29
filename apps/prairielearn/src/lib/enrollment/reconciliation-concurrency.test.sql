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
