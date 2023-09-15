ALTER TABLE assessment_instances
DROP COLUMN IF EXISTS points_in_grading;

ALTER TABLE assessment_instances
DROP COLUMN IF EXISTS score_perc_in_grading;

ALTER TABLE assessment_score_logs
DROP COLUMN IF EXISTS points_in_grading;

ALTER TABLE assessment_score_logs
DROP COLUMN IF EXISTS score_perc_in_grading;

ALTER TABLE instance_questions
DROP COLUMN IF EXISTS points_in_grading;

ALTER TABLE instance_questions
DROP COLUMN IF EXISTS score_perc_in_grading;
