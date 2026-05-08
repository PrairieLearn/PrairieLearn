ALTER TYPE enum_job_status
ADD VALUE IF NOT EXISTS 'Stopping'
AFTER 'Running';

ALTER TYPE enum_job_status
ADD VALUE IF NOT EXISTS 'Stopped'
AFTER 'Stopping';

ALTER TABLE job_sequences
ADD COLUMN stop_requested_by_authn_user_id BIGINT;

ALTER TABLE job_sequences
ADD CONSTRAINT job_sequences_stop_requested_by_authn_user_id_fkey FOREIGN KEY (stop_requested_by_authn_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
