ALTER TABLE issues ADD COLUMN instance_question_id bigint REFERENCES instance_questions ON UPDATE CASCADE ON DELETE SET NULL;
