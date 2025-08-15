-- BLOCK create_migrations_table
CREATE TABLE IF NOT EXISTS migrations (
  id bigserial PRIMARY KEY,
  filename text,
  index integer,
  project text DEFAULT 'prairielearn',
  applied_at timestamp with time zone,
  timestamp text,
  UNIQUE (project, index),
  UNIQUE (project, timestamp)
);

-- BLOCK add_projects_column
ALTER TABLE migrations
ADD COLUMN IF NOT EXISTS project text DEFAULT 'prairielearn';

CREATE UNIQUE INDEX IF NOT EXISTS migrations_project_index_key ON migrations (index, project);

ALTER TABLE migrations
DROP CONSTRAINT migrations_index_key;

DROP INDEX IF EXISTS migrations_index_key;

-- BLOCK add_timestamp_column
ALTER TABLE migrations
ADD COLUMN IF NOT EXISTS timestamp text;

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

-- BLOCK insert_migration
INSERT INTO
  migrations (filename, timestamp, project, applied_at)
VALUES
  (
    $filename::text,
    $timestamp,
    $project,
    CURRENT_TIMESTAMP
  )
RETURNING
  id;
