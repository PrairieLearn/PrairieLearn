-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY lti13_assessments_assessment_id_lti13_course_instance_id_idx ON lti13_assessments (assessment_id, lti13_course_instance_id);
