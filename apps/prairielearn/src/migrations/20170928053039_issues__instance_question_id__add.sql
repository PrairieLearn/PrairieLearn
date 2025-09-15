ALTER TABLE issues
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN instance_question_id bigint REFERENCES instance_questions ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX issues_instance_question_id_idx ON issues (instance_question_id);
