CREATE TABLE IF NOT EXISTS migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT,
  index INTEGER,
  applied_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(index)
);
