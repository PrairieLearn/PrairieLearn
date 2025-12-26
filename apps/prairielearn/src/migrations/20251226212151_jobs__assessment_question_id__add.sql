ALTER TABLE jobs
ADD COLUMN assessment_question_id BIGINT;

ALTER TABLE jobs
ADD CONSTRAINT jobs_assessment_question_id_fkey FOREIGN KEY (assessment_question_id)
REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;