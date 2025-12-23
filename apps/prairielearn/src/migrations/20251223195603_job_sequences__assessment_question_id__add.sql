ALTER TABLE job_sequences
ADD COLUMN assessment_question_id BIGINT REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE SET NULL;
