ALTER TABLE questions
ADD COLUMN copied_from text,
ADD COLUMN copied_from_question_id bigint,
ADD CONSTRAINT questions_copied_from_question_id_fkey FOREIGN KEY (copied_from_question_id) REFERENCES questions (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
