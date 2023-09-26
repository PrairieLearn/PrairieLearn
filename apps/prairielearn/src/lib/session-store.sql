-- BLOCK get_session
SELECT
  *
FROM
  user_sessions
WHERE
  session_id = $session_id
  AND expires_at > now();

-- BLOCK set_session
INSERT INTO
  user_sessions (session_id, user_id, data, updated_at, expires_at)
VALUES
  (
    $session_id,
    $user_id,
    $data::jsonb,
    now(),
    $expires_at
  )
ON CONFLICT (session_id) DO
UPDATE
SET
  data = $data::jsonb,
  updated_at = now(),
  expires_at = $expires_at;

-- BLOCK destroy_session
DELETE FROM user_sessions
WHERE
  session_id = $session_id;
