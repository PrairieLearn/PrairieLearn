-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY print_exports_assessment_id_authn_user_id_created_at_id_idx ON print_exports (
  assessment_id,
  authn_user_id,
  created_at DESC,
  id DESC
);
