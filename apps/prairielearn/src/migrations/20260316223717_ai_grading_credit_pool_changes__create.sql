CREATE TABLE ai_grading_credit_pool_changes (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  credit_before_milli_dollars BIGINT NOT NULL,
  credit_after_milli_dollars BIGINT NOT NULL,
  delta_milli_dollars BIGINT NOT NULL,
  credit_type TEXT NOT NULL CHECK (
    credit_type IN ('transferable', 'non_transferable')
  ),
  CONSTRAINT chk_credit_ledger_math CHECK (
    credit_after_milli_dollars = credit_before_milli_dollars + delta_milli_dollars
    AND credit_before_milli_dollars >= 0
    AND credit_after_milli_dollars >= 0
  ),
  reason TEXT NOT NULL,
  user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  ai_grading_job_id BIGINT REFERENCES ai_grading_jobs (id) ON UPDATE CASCADE ON DELETE SET NULL,
  assessment_question_id BIGINT REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ai_grading_credit_pool_changes_ci_created_idx ON ai_grading_credit_pool_changes (course_instance_id, created_at);
