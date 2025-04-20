CREATE TABLE access_tokens (
  id bigserial PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL,
  token TEXT,
  token_hash TEXT UNIQUE NOT NULL,
  last_used_at timestamp with time zone
)
