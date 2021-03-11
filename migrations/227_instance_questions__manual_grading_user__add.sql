ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_user bigint;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_conflict boolean DEFAULT FALSE;
