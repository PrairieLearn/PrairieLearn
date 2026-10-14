-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY assessment_access_control_prairietest_exams_uuid_idx ON assessment_access_control_prairietest_exams (uuid);
