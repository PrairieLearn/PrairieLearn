ALTER TABLE instance_questions
ADD COLUMN ai_submission_group_id bigint REFERENCES ai_submission_groups (id) ON UPDATE CASCADE ON DELETE SET NULL;
