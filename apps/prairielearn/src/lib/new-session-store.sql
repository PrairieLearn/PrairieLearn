-- BLOCK get_session
SELECT
  *
FROM
  pl_sessions
WHERE
  sid = $sid
  AND expires_at > now();

-- BLOCK set_session
INSERT INTO
  pl_sessions (sid, session, updated_at, expires_at)
VALUES
  ($sid, $session::jsonb, now(), $expires_at)
ON CONFLICT (sid) DO
UPDATE
SET
  session = $session::jsonb,
  updated_at = now(),
  expires_at = $expires_at;

-- BLOCK delete_session
DELETE FROM pl_sessions
WHERE
  sid = $sid;
