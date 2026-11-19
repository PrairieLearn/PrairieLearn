-- BLOCK insert_oauth_token
INSERT INTO
  oauth_tokens (
    oauth_grant_id,
    type,
    token_hash,
    expires_at,
    redirect_uri,
    code_challenge
  )
VALUES
  (
    $oauth_grant_id,
    $type,
    $token_hash,
    $expires_at,
    $redirect_uri,
    $code_challenge
  );

-- BLOCK select_oauth_token_with_grant
SELECT
  to_jsonb(t.*) AS oauth_token,
  to_jsonb(g.*) AS oauth_grant,
  to_jsonb(c.*) AS oauth_client
FROM
  oauth_tokens AS t
  JOIN oauth_grants AS g ON (g.id = t.oauth_grant_id)
  JOIN oauth_clients AS c ON (c.id = g.oauth_client_id)
WHERE
  t.token_hash = $token_hash;

-- BLOCK mark_oauth_token_used
UPDATE oauth_tokens
SET
  used_at = now()
WHERE
  id = $id
  AND used_at IS NULL;
