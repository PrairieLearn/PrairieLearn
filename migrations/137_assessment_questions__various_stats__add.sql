ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS number_submissions_hist_with_perfect_submission DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS number_submissions_hist_with_no_perfect_submission DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS incremental_submission_score_array_quintile_averages DOUBLE PRECISION[][];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_last_submission_score_quintiles DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS last_submission_score_variance_quintiles DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS incremental_submission_score_array_variance_quintiles DOUBLE PRECISION[][];
