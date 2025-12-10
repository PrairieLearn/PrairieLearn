ALTER TABLE submissions VALIDATE CONSTRAINT submissions_modified_at_not_null;

ALTER TABLE submissions
ALTER COLUMN modified_at
SET NOT NULL;

ALTER TABLE submissions
DROP CONSTRAINT submissions_modified_at_not_null;
