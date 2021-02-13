ALTER TABLE course_instances ADD COLUMN question_params jsonb NOT NULL DEFAULT '{}'::jsonb;
