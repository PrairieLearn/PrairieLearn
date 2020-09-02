ALTER TABLE files 
    ADD COLUMN storage_type text DEFAULT 'fileSystem',
    ADD COLUMN question_id INT;
    
ALTER TABLE files
    ADD CONSTRAINT questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON UPDATE CASCADE ON DELETE SET NULL

