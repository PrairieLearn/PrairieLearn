ALTER TABLE assessment_instances
ADD COLUMN grading_pending boolean NOT NULL DEFAULT false;

ALTER TABLE instance_questions
ADD COLUMN grading_pending boolean NOT NULL DEFAULT false;
