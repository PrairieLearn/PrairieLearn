-- BLOCK lock_timeout
SET
  LOCAL lock_timeout = '5s';

-- BLOCK lock_user
SELECT
  pg_advisory_xact_lock(
    hashtextextended ('course-agent:user:' || $user_id::text, 0)
  );
