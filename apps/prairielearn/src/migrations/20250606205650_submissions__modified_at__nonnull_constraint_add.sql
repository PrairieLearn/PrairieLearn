ALTER TABLE submissions
ALTER COLUMN modified_at
SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE submissions
ADD CONSTRAINT submissions_modified_at_not_null CHECK (modified_at IS NOT NULL) NOT VALID;
