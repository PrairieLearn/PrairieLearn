-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY variants_workspace_id_unique_idx ON variants (workspace_id)
WHERE
  workspace_id IS NOT NULL;
