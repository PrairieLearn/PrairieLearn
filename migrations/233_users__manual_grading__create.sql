CREATE TABLE IF NOT EXISTS users_manual_grading (
  user_id BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
  instance_question_id BIGINT REFERENCES instance_questions ON DELETE SET NULL ON UPDATE CASCADE,
  grading_job_id BIGINT REFERENCES instance_questions ON DELETE SET NULL ON UPDATE CASCADE,
  date_started TIMESTAMP WITH TIME ZONE,
  date_last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  date_graded TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  PRIMARY KEY(user_id, instance_question_id)
);
