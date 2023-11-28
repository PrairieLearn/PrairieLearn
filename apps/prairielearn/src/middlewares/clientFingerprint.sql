--BLOCK select_client_fingerprint
SELECT
  id
FROM
  client_fingerprints
WHERE
  user_id = $user_id
  AND user_session_id = $user_session_id
  AND ip_address = $ip_address
  AND user_agent = $user_agent
  AND accept_language = $accept_language;

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
    $user_agent,
    $accept_language
  )
RETURNING
  id;

--BLOCK update_assessment_instance_fingerprint
UPDATE assessment_instances AS ai
SET
  last_client_fingerprint_id = $client_fingerprint_id,
  client_fingerprint_id_change_count = client_fingerprint_id_change_count + 1
WHERE
  ai.id = $assessment_instance_id
  AND ai.user_id = $authn_user_id
  OR $authn_user_id IN (
    SELECT
      user_id
    FROM
      group_users
    WHERE
      group_id = ai.group_id
  );

--BLOCK select_session_id
SELECT
  id
FROM
  user_sessions
WHERE
  session_id = $user_session_id
