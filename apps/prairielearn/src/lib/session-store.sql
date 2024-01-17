-- BLOCK get_session
SELECT
  *
FROM
  user_sessions
WHERE
  session_id = $session_id
  AND expires_at > now()
  AND revoked_at IS NULL;

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
  user_id = $user_id,
  data = $data::jsonb,
  updated_at = now(),
  expires_at = $expires_at;

-- BLOCK destroy_session
UPDATE user_sessions
SET
  revoked_at = now()
WHERE
  session_id = $session_id;
