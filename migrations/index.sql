-- BLOCK create_migrations_table
CREATE TABLE IF NOT EXISTS migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT,
  index INTEGER,
  applied_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(index)
);

-- BLOCK get_last_migration
SELECT MAX(index) AS last_migration FROM migrations;

-- BLOCK insert_migration
INSERT INTO migrations
        (filename, index, applied_at)
VALUES ($filename::TEXT, $index, CURRENT_TIMESTAMP)
RETURNING id;
