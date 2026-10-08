ALTER TABLE assessment_instances
ADD COLUMN grading_pending boolean NOT NULL DEFAULT false;

ALTER TABLE assessment_score_logs
ADD COLUMN grading_pending boolean NOT NULL DEFAULT false;
