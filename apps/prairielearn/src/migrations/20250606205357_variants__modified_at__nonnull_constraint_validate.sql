ALTER TABLE variants VALIDATE CONSTRAINT variants_modified_at_not_null;

ALTER TABLE variants
ALTER COLUMN modified_at
SET NOT NULL;

ALTER TABLE variants
DROP CONSTRAINT variants_modified_at_not_null;
