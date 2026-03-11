-- prairielearn:migrations NO TRANSACTION
CREATE INDEX CONCURRENTLY IF NOT EXISTS instance_questions_aq_id_requires_manual_grading_idx ON instance_questions (assessment_question_id)
WHERE
  requires_manual_grading;
