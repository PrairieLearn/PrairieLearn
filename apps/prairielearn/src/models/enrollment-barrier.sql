-- The one-bigint advisory lock space is distinct from the two-integer space
-- used by the server-job and AI-grading locks. Course instance IDs are
-- positive, so negating them provides an injective key for the full positive bigint
-- range without colliding with positive one-bigint advisory locks.
-- BLOCK acquire_shared_course_instance_enrollment_barrier
SELECT
  pg_advisory_xact_lock_shared(- ($course_instance_id::bigint));
