ALTER TABLE files
DROP CONSTRAINT files_instance_question_id_fkey,
ADD CONSTRAINT files_instance_question_id_fkey FOREIGN KEY (instance_question_id) REFERENCES instance_questions (id) ON UPDATE CASCADE ON DELETE SET NULL;
