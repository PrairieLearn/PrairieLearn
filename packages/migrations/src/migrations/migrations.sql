-- BLOCK create_migrations_table
CREATE TABLE IF NOT EXISTS migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT,
  index INTEGER,
  project TEXT DEFAULT 'prairielearn',
  applied_at TIMESTAMP WITH TIME ZONE,
  timestamp TEXT,
  UNIQUE (project, index),
  UNIQUE (project, timestamp)
);

-- BLOCK add_projects_column
ALTER TABLE migrations
ADD COLUMN IF NOT EXISTS project TEXT DEFAULT 'prairielearn';

CREATE UNIQUE INDEX IF NOT EXISTS migrations_project_index_key ON migrations (index, project);

ALTER TABLE migrations
DROP CONSTRAINT migrations_index_key;

DROP INDEX IF EXISTS migrations_index_key;

-- BLOCK add_timestamp_column
ALTER TABLE migrations
ADD COLUMN IF NOT EXISTS timestamp TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS migrations_project_timestamp_key ON migrations (timestamp, project);

-- BLOCK get_migrations
SELECT
  id,
  filename,
  index,
  timestamp
FROM
  migrations
WHERE
  project = $project;

-- BLOCK update_migration
UPDATE migrations
SET
  filename = $filename,
  timestamp = $timestamp
WHERE
  id = $id;

-- BLOCK insert_migration
INSERT INTO
  migrations (filename, timestamp, project, applied_at)
VALUES
  (
    $filename::TEXT,
    $timestamp,
    $project,
    CURRENT_TIMESTAMP
  )
RETURNING
  id;
