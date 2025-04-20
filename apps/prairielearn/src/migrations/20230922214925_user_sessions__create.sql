CREATE TABLE user_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  data JSONB NOT NULL,
  UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_updated_at_idx ON user_sessions (user_id, updated_at);
