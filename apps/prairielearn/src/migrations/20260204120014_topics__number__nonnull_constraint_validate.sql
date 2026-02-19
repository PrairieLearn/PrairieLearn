ALTER TABLE topics VALIDATE CONSTRAINT topics_number_not_null;

ALTER TABLE topics
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE topics
DROP CONSTRAINT topics_number_not_null;
