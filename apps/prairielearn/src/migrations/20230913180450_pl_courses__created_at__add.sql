ALTER TABLE pl_courses
ADD COLUMN created_at TIMESTAMP WITH TIME ZONE;

-- Set the default separately so that it doesn't update the value on all
-- existing rows. We'll backfill this data for existing courses separately.
ALTER TABLE pl_courses
ALTER COLUMN created_at
SET DEFAULT NOW();
