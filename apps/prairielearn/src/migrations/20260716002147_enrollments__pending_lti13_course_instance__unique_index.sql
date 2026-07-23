-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY enrollments_pending_lti13_ciid_sub_course_instance_id_idx ON enrollments (
  pending_lti13_course_instance_id,
  pending_lti13_sub,
  course_instance_id
);
