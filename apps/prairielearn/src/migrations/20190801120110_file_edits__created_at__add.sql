ALTER TABLE file_edits
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;
