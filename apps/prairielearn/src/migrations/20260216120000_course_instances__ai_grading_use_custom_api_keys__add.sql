ALTER TABLE course_instances
ADD COLUMN IF NOT EXISTS ai_grading_use_custom_api_keys BOOLEAN NOT NULL DEFAULT FALSE;
