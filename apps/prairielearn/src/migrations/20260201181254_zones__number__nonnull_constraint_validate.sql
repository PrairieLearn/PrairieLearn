ALTER TABLE zones VALIDATE CONSTRAINT zones_number_not_null;

ALTER TABLE zones
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE zones
DROP CONSTRAINT zones_number_not_null;
