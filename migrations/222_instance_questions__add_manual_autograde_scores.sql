ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_grading_reserved_points DOUBLE PRECISION DEFAULT NULL;
