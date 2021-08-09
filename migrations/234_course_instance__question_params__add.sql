ALTER TABLE course_instances ADD COLUMN question_params jsonb DEFAULT '{}'::jsonb;
