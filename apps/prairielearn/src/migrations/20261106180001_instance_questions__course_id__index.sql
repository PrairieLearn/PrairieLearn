-- prairielearn:migrations NO TRANSACTION
-- The course agent's row-level security policy on this table compares course_id with a constant.
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY instance_questions_course_id_idx ON instance_questions (course_id);
