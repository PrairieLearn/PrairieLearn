-- BLOCK acquire_shared_course_instance_enrollment_barrier
SELECT
  pg_advisory_xact_lock_shared(
    hashtextextended (
      'course-instance-enrollment:' || course_instance_id::text,
      0
    )
  )
FROM
  unnest($course_instance_ids::bigint[]) AS course_instance_ids (course_instance_id)
  -- PostgreSQL evaluates the volatile lock call after sorting, so locks are
  -- acquired in this order.
ORDER BY
  course_instance_id;

-- BLOCK acquire_exclusive_course_instance_enrollment_barrier
SELECT
  pg_advisory_xact_lock(
    hashtextextended (
      'course-instance-enrollment:' || course_instance_id::text,
      0
    )
  )
FROM
  unnest($course_instance_ids::bigint[]) AS course_instance_ids (course_instance_id)
  -- PostgreSQL evaluates the volatile lock call after sorting, so locks are
  -- acquired in this order.
ORDER BY
  course_instance_id;
