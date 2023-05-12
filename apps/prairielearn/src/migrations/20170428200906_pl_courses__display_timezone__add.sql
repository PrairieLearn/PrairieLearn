ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS display_timezone text;

UPDATE pl_courses
SET
  display_timezone = 'America/Chicago'
WHERE
  display_timezone IS NULL;
