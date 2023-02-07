-- BLOCK ensure_named_locks_table
CREATE TABLE IF NOT EXISTS named_locks (
    id bigserial PRIMARY KEY,
    name text NOT NULL UNIQUE
);

-- BLOCK ensure_named_lock_row
INSERT INTO named_locks
    (name)
VALUES
    ($name)
ON CONFLICT (name) DO NOTHING;
