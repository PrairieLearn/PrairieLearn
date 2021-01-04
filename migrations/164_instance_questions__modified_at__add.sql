ALTER TABLE instance_questions ADD COLUMN modified_at timestamp with time zone default CURRENT_TIMESTAMP;
ALTER TABLE assessment_instances ADD COLUMN modified_at timestamp with time zone default CURRENT_TIMESTAMP;

CREATE INDEX instance_questions_modified_at_key ON instance_questions (modified_at);
CREATE INDEX assessment_instances_modified_at_key ON assessment_instances (modified_at);

UPDATE instance_questions SET modified_at = created_at;
UPDATE assessment_instances SET modified_at = date;

ALTER TABLE instance_questions ALTER COLUMN modified_at SET NOT NULL;
ALTER TABLE assessment_instances ALTER COLUMN modified_at SET NOT NULL;
