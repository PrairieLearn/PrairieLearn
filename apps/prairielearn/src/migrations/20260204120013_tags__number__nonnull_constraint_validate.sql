ALTER TABLE tags VALIDATE CONSTRAINT tags_number_not_null;

ALTER TABLE tags
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE tags
DROP CONSTRAINT tags_number_not_null;
