-- What PrairieLearn stores as an OAuth authorization server: registered clients, grants, sessions,
-- codes, and tokens. The oidc-provider library defines each record's payload; this table is its
-- storage adapter's only table.
CREATE TABLE IF NOT EXISTS oauth_records (
  -- The library's name for the kind of record, such as `Grant` or `AccessToken`.
  model text NOT NULL,
  -- For kinds whose ID works as a credential, such as tokens, this is the ID's SHA-256 hash.
  id text NOT NULL,
  payload jsonb NOT NULL,
  -- Set on codes and tokens, so that revoking a grant can delete them together.
  grant_id text,
  -- A session's second identifier, which the library looks sessions up by.
  uid text,
  -- The user a grant, session, code, or token belongs to.
  user_id bigint REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  expires_at timestamptz,
  -- Codes and refresh tokens work once. A second use means the value was copied.
  consumed_at timestamptz,
  PRIMARY KEY (model, id)
);

CREATE INDEX IF NOT EXISTS oauth_records_grant_id_idx ON oauth_records (grant_id);

CREATE INDEX IF NOT EXISTS oauth_records_user_id_idx ON oauth_records (user_id);

CREATE INDEX IF NOT EXISTS oauth_records_uid_idx ON oauth_records (uid);
