ALTER TABLE sharing_sets
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE questions
RENAME COLUMN shared_publicly_with_source TO shared_source_publicly;
