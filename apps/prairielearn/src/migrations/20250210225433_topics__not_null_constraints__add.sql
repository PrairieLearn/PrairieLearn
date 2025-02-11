ALTER TABLE topics
ALTER COLUMN name
SET NOT NULL;

ALTER TABLE topics
ALTER COLUMN color
SET NOT NULL;

ALTER TABLE topics
ALTER COLUMN description
SET DEFAULT '';

UPDATE topics
SET
  description = ''
WHERE
  description IS NULL;

-- TODO: before deploying this, ensure all writes use a non-null description.
ALTER TABLE topics
ALTER COLUMN description
SET NOT NULL;
