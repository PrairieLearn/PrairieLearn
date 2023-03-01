UPDATE assessments
SET
  number = '0'
WHERE
  number IS NULL;

ALTER TABLE assessments
ALTER COLUMN number
SET DEFAULT '0',
ALTER COLUMN number
SET NOT NULL;
