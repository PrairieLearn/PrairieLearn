-- Authorization codes, access tokens, and refresh tokens. Only hashes are stored.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id bigserial PRIMARY KEY,
  oauth_grant_id bigint NOT NULL REFERENCES oauth_grants ON UPDATE CASCADE ON DELETE CASCADE,
  type text NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  -- Codes and refresh tokens work once. A second use means the token was copied.
  used_at timestamptz,
  -- Set for codes only: what the token request must repeat or prove (PKCE).
  redirect_uri text,
  code_challenge text,
  CONSTRAINT oauth_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT oauth_tokens_type_check CHECK (type IN ('code', 'access', 'refresh')),
  CONSTRAINT oauth_tokens_code_fields_check CHECK (
    (type = 'code') = (
      redirect_uri IS NOT NULL
      AND code_challenge IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS oauth_tokens_oauth_grant_id_idx ON oauth_tokens (oauth_grant_id);
