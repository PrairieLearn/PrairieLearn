ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS mean_score DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS discrimination DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_number_attempts DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS quintile_scores DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS some_correct_submission_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS first_attempt_correct_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS last_attempt_correct_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS some_submission_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_of_average_success_rates DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_success_rate_hist DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_length_of_incorrect_streak_with_some_correct_submission DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS length_of_incorrect_streak_hist_with_some_correct_submission DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_length_of_incorrect_streak_with_no_correct_submission DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS length_of_incorrect_streak_hist_with_no_correct_submission DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS num_attempts_hist DOUBLE PRECISION[];