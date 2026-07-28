-- The enrollment barrier uses namespace 3 to avoid collisions with the
-- namespace-1 server-job lock and namespace-2 AI-grading lock.
-- BLOCK acquire_shared_course_instance_enrollment_barrier
SELECT
  pg_advisory_xact_lock_shared(3, $course_instance_id::integer);

-- BLOCK acquire_exclusive_course_instance_enrollment_barrier
SELECT
  pg_advisory_xact_lock(3, $course_instance_id::integer);
