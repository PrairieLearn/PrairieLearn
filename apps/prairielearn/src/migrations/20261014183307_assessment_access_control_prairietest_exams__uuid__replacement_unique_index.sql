-- prairielearn:migrations NO TRANSACTION
-- Build the replacement before the constraint swap so writes remain protected throughout the deploy.
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY aac_prairietest_exams_uuid_rule_id_idx ON assessment_access_control_prairietest_exams (uuid, assessment_access_control_rule_id);
