ALTER TABLE assessment_access_rules
ADD COLUMN exam_id bigint REFERENCES exams ON UPDATE CASCADE ON DELETE SET NULL;
