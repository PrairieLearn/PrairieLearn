ALTER TABLE course_instances
ADD COLUMN IF NOT EXISTS display_timezone text;

UPDATE course_instances
SET
  display_timezone = 'America/Chicago'
WHERE
  display_timezone IS NULL;
