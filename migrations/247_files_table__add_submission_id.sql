ALTER TABLE files ADD COLUMN submission_id BIGINT REFERENCES submissions ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS files_submission_id_idx ON files (submission_id);
