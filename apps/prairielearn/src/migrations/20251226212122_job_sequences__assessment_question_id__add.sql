ALTER TABLE job_sequences
ADD COLUMN assessment_question_id BIGINT;

ALTER TABLE job_sequences
ADD CONSTRAINT job_sequences_assessment_question_id_fkey FOREIGN KEY (assessment_question_id)
REFERENCES assessment_questions (id) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;