CREATE TABLE IF NOT EXISTS pl_sessions (
  sid TEXT PRIMARY KEY,
  session JSONB,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX pl_sessions_updated_at_idx ON pl_sessions (updated_at);

CREATE INDEX pl_sessions_session_idx ON pl_sessions USING GIN (session);
