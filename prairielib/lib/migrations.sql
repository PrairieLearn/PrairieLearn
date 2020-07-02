-- BLOCK create_migrations_table
CREATE TABLE IF NOT EXISTS migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT,
  index INTEGER,
  project TEXT DEFAULT 'prairielearn',
  applied_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(project, index)
);

-- BLOCK alter_migrations_table
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS project TEXT DEFAULT 'prairielearn';
CREATE UNIQUE INDEX IF NOT EXISTS migrations_index_project_key ON migrations (index, project);
ALTER TABLE migrations DROP CONSTRAINT migrations_index_key;
DROP INDEX IF EXISTS migrations_index_key;

-- BLOCK get_last_migration
SELECT MAX(index) AS last_migration FROM migrations WHERE project = $project;

-- BLOCK insert_migration
INSERT INTO migrations
        (filename, index, project, applied_at)
VALUES ($filename::TEXT, $index, $project, CURRENT_TIMESTAMP)
RETURNING id;
