-- extra columns from PrairieSchedule
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_string text NOT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS rubric text NOT NULL;
