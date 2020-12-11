ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_reserved_points DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_points DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_feedback jsonb DEFAULT NULL;
