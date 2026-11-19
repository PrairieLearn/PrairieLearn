-- BLOCK insert_workspace_bootstrap_token
INSERT INTO
  workspace_bootstrap_tokens (
    token_hash,
    workspace_id,
    session_id,
    authorization_cookies,
    public_question_endpoint,
    expires_at
  )
VALUES
  (
    $token_hash,
    $workspace_id,
    $session_id,
    $authorization_cookies::jsonb,
    $public_question_endpoint,
    now() + interval '1 minute'
  );

-- BLOCK consume_workspace_bootstrap_token
DELETE FROM workspace_bootstrap_tokens
WHERE
  token_hash = $token_hash
  AND workspace_id = $workspace_id
  AND expires_at > now()
RETURNING
  *;

-- BLOCK delete_expired_workspace_bootstrap_tokens
DELETE FROM workspace_bootstrap_tokens
WHERE
  expires_at <= now();
