-- BLOCK set_short_lock_timeout
SET
  LOCAL lock_timeout = '100ms';

-- BLOCK acquire_exclusive_course_instance_enrollment_barrier
SELECT
  pg_advisory_xact_lock(
    hashtextextended (
      'course-instance-enrollment:' || $course_instance_id::text,
      0
    )
  );
