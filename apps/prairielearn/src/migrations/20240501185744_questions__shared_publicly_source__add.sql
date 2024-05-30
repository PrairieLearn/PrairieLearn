ALTER TABLE questions
ADD COLUMN shared_publicly_with_source BOOLEAN NOT NULL DEFAULT FALSE;
