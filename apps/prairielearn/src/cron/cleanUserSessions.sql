-- BLOCK clean_user_sessions
DELETE FROM user_sessions
WHERE
  user_id IS NULL
  AND created_at < now() - '1 hour'::interval;
