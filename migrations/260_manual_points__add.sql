ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS manual_points DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS max_auto_points DOUBLE PRECISION;

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS auto_points DOUBLE PRECISION;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_points DOUBLE PRECISION;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS auto_score_perc DOUBLE PRECISION;

ALTER TABLE grading_jobs ADD COLUMN IF NOT EXISTS auto_points DOUBLE PRECISION;
ALTER TABLE grading_jobs ADD COLUMN IF NOT EXISTS manual_points DOUBLE PRECISION;

ALTER TABLE question_score_logs ADD COLUMN IF NOT EXISTS auto_points DOUBLE PRECISION;
ALTER TABLE question_score_logs ADD COLUMN IF NOT EXISTS manual_points DOUBLE PRECISION;
ALTER TABLE question_score_logs ADD COLUMN IF NOT EXISTS max_auto_points DOUBLE PRECISION;
ALTER TABLE question_score_logs ADD COLUMN IF NOT EXISTS max_manual_points DOUBLE PRECISION;
ALTER TABLE question_score_logs ADD COLUMN IF NOT EXISTS auto_score_perc DOUBLE PRECISION;
