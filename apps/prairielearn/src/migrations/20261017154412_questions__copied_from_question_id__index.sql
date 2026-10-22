-- prairielearn:migrations NO TRANSACTION
-- Intentionally omit IF NOT EXISTS so a failed concurrent build's invalid index is not silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY questions_copied_from_question_id_idx ON questions (copied_from_question_id)
WHERE
  copied_from_question_id IS NOT NULL;
