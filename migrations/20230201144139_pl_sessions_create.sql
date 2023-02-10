CREATE TABLE IF NOT EXISTS pl_sessions (
    sid TEXT PRIMARY KEY,
    session JSONB,
    updated_at timestamp with time zone
);
