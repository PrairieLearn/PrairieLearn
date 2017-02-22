ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS some_correct_submission BOOLEAN;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS first_attempt_correct BOOLEAN;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS last_attempt_correct BOOLEAN;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS some_submission BOOLEAN;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS average_success_rate DOUBLE PRECISION;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS length_of_incorrect_streak INTEGER;