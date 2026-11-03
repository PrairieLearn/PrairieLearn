-- prairielearn:migrations NO TRANSACTION
-- Intentionally fail if a previous concurrent build left an invalid index.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY chunks_latest_revision_idx ON chunks (
  course_id,
  type,
  coalesce(question_id, -1),
  coalesce(course_instance_id, -1),
  coalesce(assessment_id, -1),
  created_at DESC NULLS LAST,
  id DESC
);
