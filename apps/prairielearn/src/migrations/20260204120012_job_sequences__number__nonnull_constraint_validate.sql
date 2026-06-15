ALTER TABLE job_sequences VALIDATE CONSTRAINT job_sequences_number_not_null;

ALTER TABLE job_sequences
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE job_sequences
DROP CONSTRAINT job_sequences_number_not_null;
