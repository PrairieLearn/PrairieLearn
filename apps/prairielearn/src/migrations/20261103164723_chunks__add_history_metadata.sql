-- created_at will record sync time, not Git commit time. Leave it, the commit
-- hash, and archive sizes NULL until sync writers can supply accurate values.
ALTER TABLE chunks
ADD COLUMN created_at timestamptz,
ADD COLUMN commit_hash text,
ADD COLUMN deleted boolean NOT NULL DEFAULT false,
ADD COLUMN size_compressed bigint,
ADD COLUMN size_uncompressed bigint;
