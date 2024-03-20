ALTER TABLE exams
ADD COLUMN IF NOT EXISTS exam_type enum_exam_type;
