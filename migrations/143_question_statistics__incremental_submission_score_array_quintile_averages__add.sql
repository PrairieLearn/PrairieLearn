ALTER TABLE question_statistics ADD COLUMN IF NOT EXISTS incremental_submission_score_array_quintile_averages DOUBLE PRECISION[][];