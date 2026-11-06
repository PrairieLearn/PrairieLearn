ALTER TABLE chunks
ALTER COLUMN uuid
DROP NOT NULL,
ADD CONSTRAINT chunks_uuid_deleted_check CHECK (deleted = (uuid IS NULL)) NOT VALID;
