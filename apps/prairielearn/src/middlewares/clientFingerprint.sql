--BLOCK select_client_fingerprint
SELECT
  id
FROM
  client_fingerprints
WHERE
  user_id = $user_id
  AND user_session_id = $user_session_id
  AND ip_address = $ip_address
  AND user_agent = $user_agent::VARCHAR(255)
  AND accept_language = $accept_language::VARCHAR(255);

--BLOCK insert_client_fingerprint
INSERT INTO
  client_fingerprints (
    user_id,
    user_session_id,
    ip_address,
    user_agent,
    accept_language
  )
VALUES
  (
    $user_id,
    $user_session_id,
    $ip_address,
    $user_agent::VARCHAR(255),
    $accept_language::VARCHAR(255)
  )
ON CONFLICT (
  user_id,
  user_session_id,
  ip_address,
  user_agent,
  accept_language
) DO
UPDATE
SET
  -- Force an update so that `RETURNING` will actually return the row.
  accept_language = EXCLUDED.accept_language
RETURNING
  id;

--BLOCK update_assessment_instance_fingerprint
UPDATE assessment_instances AS ai
SET
  last_client_fingerprint_id = $client_fingerprint_id,
  client_fingerprint_id_change_count = CASE
    WHEN ai.last_client_fingerprint_id IS NULL THEN 0
    ELSE client_fingerprint_id_change_count + 1
  END
WHERE
  ai.id = $assessment_instance_id
  AND (
    ai.user_id = $authn_user_id
    OR $authn_user_id IN (
      SELECT
        user_id
      FROM
        group_users
      WHERE
        group_id = ai.group_id
    )
  );

--BLOCK select_user_session_id
SELECT
  id
FROM
  user_sessions
WHERE
  session_id = $session_id
