ALTER TABLE alternative_groups VALIDATE CONSTRAINT alternative_groups_number_not_null;

ALTER TABLE alternative_groups
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE alternative_groups
DROP CONSTRAINT alternative_groups_number_not_null;
