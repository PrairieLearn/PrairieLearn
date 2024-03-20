ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS options jsonb;
