ALTER TABLE questions
    ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN sync_errors TEXT,
    ADD COLUMN sync_warnings TEXT;

ALTER TABLE course_instances
    ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN sync_errors TEXT,
    ADD COLUMN sync_warnings TEXT;

ALTER TABLE assessments
    ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN sync_errors TEXT,
    ADD COLUMN sync_warnings TEXT;
