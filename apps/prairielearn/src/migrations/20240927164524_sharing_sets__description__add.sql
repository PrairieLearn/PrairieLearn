ALTER TABLE sharing_sets
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS shared_source_publicly BOOLEAN NOT NULL DEFAULT FALSE;
