-- prairielearn:migrations NO TRANSACTION
-- Intentionally fail if a previous concurrent build left an invalid index.
-- squawk-ignore prefer-robust-stmts
CREATE UNIQUE INDEX CONCURRENTLY chunks_current_values_key ON chunks (
  course_id,
  type,
  coalesce(question_id, -1),
  coalesce(course_instance_id, -1),
  coalesce(assessment_id, -1)
)
WHERE
  superseded_at IS NULL;
