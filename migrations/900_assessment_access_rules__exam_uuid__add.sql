ALTER TABLE exams ADD COLUMN IF NOT EXISTS uuid uuid NULL UNIQUE;
ALTER TABLE assessment_access_rules ADD COLUMN exam_uuid uuid NULL;
