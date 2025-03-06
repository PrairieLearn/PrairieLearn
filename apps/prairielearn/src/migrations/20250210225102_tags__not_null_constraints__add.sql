ALTER TABLE tags
ALTER COLUMN name
SET NOT NULL;

ALTER TABLE tags
ALTER COLUMN color
SET NOT NULL;

UPDATE tags
SET
  description = ''
WHERE
  description IS NULL;

ALTER TABLE tags
ALTER COLUMN description
SET NOT NULL;

-- At this point, `number` is still nullable, as we have NULL values in production.
-- We'll add a `NOT NULL` constraint once we've stopped writing NULL values and
-- backfilled all existing NULL values.
