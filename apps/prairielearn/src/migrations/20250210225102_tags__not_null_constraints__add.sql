ALTER TABLE tags
ALTER COLUMN name
SET NOT NULL;

ALTER TABLE tags
ALTER COLUMN color
SET NOT NULL;

ALTER TABLE tags
ALTER COLUMN description
SET DEFAULT '';

UPDATE tags
SET
  description = ''
WHERE
  description IS NULL;

-- TODO: before deploying this, ensure all writes use a non-null description.
ALTER TABLE tags
ALTER COLUMN description
SET NOT NULL;
