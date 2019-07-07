ALTER TABLE exams ADD COLUMN IF NOT EXISTS uuid uuid UNIQUE;
ALTER TABLE assessment_access_rules
    ADD COLUMN exam_uuid uuid,
    DROP COLUMN exam_id;
