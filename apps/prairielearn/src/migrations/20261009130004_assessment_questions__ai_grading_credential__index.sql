-- prairielearn:migrations NO TRANSACTION
-- Omit IF NOT EXISTS so an invalid index from a failed build cannot be silently accepted.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY assessment_questions_ai_grading_credential_idx ON assessment_questions (ai_grading_last_selected_credential_id)
WHERE
  ai_grading_last_selected_credential_id IS NOT NULL;
