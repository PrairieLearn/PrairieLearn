-- Someday git will move away from SHA-1 hashes, so we won't constrain this
-- column to 40 characters.
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS commit_hash TEXT;
