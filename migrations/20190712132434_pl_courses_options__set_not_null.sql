UPDATE pl_courses
SET
  options = '{}'::jsonb
WHERE
  options IS NULL;

ALTER TABLE pl_courses
ALTER COLUMN options
SET DEFAULT '{}'::jsonb,
ALTER COLUMN options
SET NOT NULL;
