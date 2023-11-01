--BLOCK select_client_fingerprint
SELECT
  id, user_id, ip_address, user_agent, accept, accept_language
FROM
  client_fingerprints
WHERE
  user_id = $user_id
  AND ip_address = $ip_address
  AND user_agent = $user_agent
  AND accept = $accept
  AND accept_language = $accept_language

--BLOCK insert_client_fingerprint
INSERT INTO client_fingerprints (
  user_id,
  ip_address,
  user_agent,
  accept_language,
  accept
) 
VALUES (
  $user_id,
  $ip_address,
  $user_agent,
  $accept_language,
  $accept
)
RETURNING id
