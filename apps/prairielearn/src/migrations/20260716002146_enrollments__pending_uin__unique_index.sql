-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY enrollments_course_instance_id_pending_uin_idx ON enrollments (course_instance_id, pending_uin);
