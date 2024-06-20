CREATE TYPE enum_batched_migration_status AS ENUM(
  'pending',
  'paused',
  'running',
  'finalizing',
  'failed',
  'succeeded'
);

CREATE TYPE enum_batched_migration_job_status AS ENUM('pending', 'failed', 'succeeded');

CREATE TABLE IF NOT EXISTS batched_migrations (
  id BIGSERIAL PRIMARY KEY,
  project TEXT DEFAULT 'prairielearn' NOT NULL,
  filename TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  batch_size INTEGER NOT NULL,
  min_value BIGINT NOT NULL,
  max_value BIGINT NOT NULL,
  status enum_batched_migration_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (project, timestamp),
  CONSTRAINT batched_migrations_min_value_check CHECK (min_value > 0),
  CONSTRAINT batched_migrations_max_value_check CHECK (max_value >= min_value)
);

CREATE TABLE IF NOT EXISTS batched_migration_jobs (
  id BIGSERIAL PRIMARY KEY,
  batched_migration_id BIGINT NOT NULL REFERENCES batched_migrations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  min_value BIGINT NOT NULL,
  max_value BIGINT NOT NULL,
  status enum_batched_migration_job_status DEFAULT 'pending' NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  data jsonb,
  CONSTRAINT batched_migration_jobs_min_value_check CHECK (min_value > 0),
  CONSTRAINT batched_migration_jobs_max_value_check CHECK (max_value >= min_value)
);

CREATE INDEX IF NOT EXISTS batched_migration_jobs_batched_migration_id_max_value_idx ON batched_migration_jobs (batched_migration_id, max_value);

CREATE INDEX IF NOT EXISTS batched_migration_jobs_batched_migration_id_status_idx ON batched_migration_jobs (batched_migration_id, status);
