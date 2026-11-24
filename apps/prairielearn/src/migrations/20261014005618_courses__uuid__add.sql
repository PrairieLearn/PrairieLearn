-- Set the default separately to avoid rewriting existing course rows with a
-- volatile default. Backfill after deployment, then enforce uniqueness and NOT NULL
-- in subsequent PRs as part of #15996.
ALTER TABLE courses
ADD COLUMN uuid uuid;

ALTER TABLE courses
ALTER COLUMN uuid
SET DEFAULT gen_random_uuid();
