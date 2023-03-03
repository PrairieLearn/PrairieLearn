CREATE TABLE IF NOT EXISTS batched_migrations (
  current BIGINT NOT NULL,
  finished_at TIMESTAMP WITH TIME ZONE,
  id BIGSERIAL PRIMARY KEY,
  max BIGINT NOT NULL,
  min BIGINT NOT NULL,
  name TEXT,
  project TEXT DEFAULT 'prairielearn',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  timestamp TEXT,
  UNIQUE (project, timestamp)
)
