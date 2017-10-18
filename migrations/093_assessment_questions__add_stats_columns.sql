ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS mean_question_score DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS question_score_variance DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS discrimination DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS quintile_question_scores DOUBLE PRECISION[];

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS some_submission_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS some_perfect_submission_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS some_nonzero_submission_perc DOUBLE PRECISION;


ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_first_submission_score DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS first_submission_score_variance DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS first_submission_score_hist DOUBLE PRECISION[];

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_last_submission_score DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS last_submission_score_variance DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS last_submission_score_hist DOUBLE PRECISION[];

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_max_submission_score DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS max_submission_score_variance DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS max_submission_score_hist DOUBLE PRECISION[];

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_average_submission_score DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_submission_score_variance DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_submission_score_hist DOUBLE PRECISION[];


ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS submission_score_array_averages DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS submission_score_array_variances DOUBLE PRECISION[];

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS incremental_submission_score_array_averages DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS incremental_submission_score_array_variances DOUBLE PRECISION[];

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS incremental_submission_points_array_averages DOUBLE PRECISION[];
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS incremental_submission_points_array_variances DOUBLE PRECISION[];


ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS average_number_submissions DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS number_submissions_variance DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS number_submissions_hist DOUBLE PRECISION[];