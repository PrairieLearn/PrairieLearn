-- BLOCK ensure_named_lock_row
INSERT INTO named_locks
    (name)
VALUES
    ($name)
ON CONFLICT (name) DO NOTHING;

-- BLOCK lock_row_nowait
SELECT *
FROM named_locks
WHERE name = $name
FOR UPDATE SKIP LOCKED;

-- BLOCK lock_row_wait
SELECT *
FROM named_locks
WHERE name = $name
FOR UPDATE;
