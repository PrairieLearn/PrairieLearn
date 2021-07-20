ALTER TABLE pl_courses ADD COLUMN question_params jsonb NOT NULL DEFAULT '{}'::jsonb;
