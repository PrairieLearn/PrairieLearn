ALTER TABLE assessments ADD COLUMN question_params jsonb DEFAULT '{}'::jsonb;
ALTER TABLE zones ADD COLUMN question_params jsonb DEFAULT '{}'::jsonb;
ALTER TABLE alternative_groups ADD COLUMN question_params jsonb DEFAULT '{}'::jsonb;
ALTER TABLE assessment_questions ADD COLUMN question_params jsonb DEFAULT '{}'::jsonb;