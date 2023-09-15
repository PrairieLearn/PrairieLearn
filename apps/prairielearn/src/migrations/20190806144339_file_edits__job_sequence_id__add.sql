ALTER TABLE file_edits
ADD COLUMN IF NOT EXISTS job_sequence_id BIGINT;
