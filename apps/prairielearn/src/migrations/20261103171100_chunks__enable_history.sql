-- Deploy compatible readers/writers before this migration. Dropping the index
-- also activates history in generators still running that preparation release.
ALTER TABLE chunks
ALTER COLUMN uuid
DROP NOT NULL,
ADD CONSTRAINT chunks_uuid_deleted_check CHECK (deleted = (uuid IS NULL)) NOT VALID;

DROP INDEX chunks_unique_values_key;
