ALTER TABLE assessment_access_rules
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN exam_id bigint REFERENCES exams ON UPDATE CASCADE ON DELETE SET NULL;
