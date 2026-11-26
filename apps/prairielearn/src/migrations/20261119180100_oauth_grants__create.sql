-- One user's approval of one client. Tokens belong to a grant, so revoking it ends all of them.
CREATE TABLE IF NOT EXISTS oauth_grants (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  oauth_client_id bigint NOT NULL REFERENCES oauth_clients ON UPDATE CASCADE ON DELETE CASCADE,
  scopes text[] NOT NULL,
  -- The server the tokens are for (RFC 8707), so they are refused anywhere else.
  resource text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The user must sign in and approve again after this, however recently the grant was used.
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS oauth_grants_user_id_idx ON oauth_grants (user_id);

CREATE INDEX IF NOT EXISTS oauth_grants_oauth_client_id_idx ON oauth_grants (oauth_client_id);
