CREATE TABLE IF NOT EXISTS users_manual_grading (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
  instance_question_id BIGINT REFERENCES instance_questions ON DELETE SET NULL ON UPDATE CASCADE,
  date_started TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id)
);
-- ALTER TABLE users_manual_grading ADD CONSTRAINT unique_user_id UNIQUE USING INDEX user_id;
