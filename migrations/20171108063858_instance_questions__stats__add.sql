ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS some_submission BOOLEAN;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS some_perfect_submission BOOLEAN;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS some_nonzero_submission BOOLEAN;

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS first_submission_score DOUBLE PRECISION;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS last_submission_score DOUBLE PRECISION;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS max_submission_score DOUBLE PRECISION;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS average_submission_score DOUBLE PRECISION;

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS submission_score_array DOUBLE PRECISION[];
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS incremental_submission_score_array DOUBLE PRECISION[];
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS incremental_submission_points_array DOUBLE PRECISION[];
