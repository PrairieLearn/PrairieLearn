-- prairielearn:migrations NO TRANSACTION
-- Intentionally fail if a previous concurrent build left an invalid index.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY chunks_course_created_at_idx ON chunks (course_id, created_at DESC NULLS LAST);
