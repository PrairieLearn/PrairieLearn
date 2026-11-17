-- prairielearn:migrations NO TRANSACTION
-- Build the replacement before the constraint swap so writes remain protected throughout the deploy.
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY enrollments_pending_uin_course_instance_id_idx ON enrollments (pending_uin, course_instance_id);
