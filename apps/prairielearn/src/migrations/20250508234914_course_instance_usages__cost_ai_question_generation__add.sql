ALTER TABLE course_instance_usages
ADD COLUMN IF NOT EXISTS cost_ai_question_generation DOUBLE PRECISION NOT NULL DEFAULT 0;
