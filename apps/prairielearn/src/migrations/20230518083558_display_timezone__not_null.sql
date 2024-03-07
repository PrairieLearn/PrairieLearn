UPDATE pl_courses c
SET
  display_timezone = i.display_timezone
FROM
  institutions i
WHERE
  c.display_timezone IS NULL
  AND i.id = c.institution_id;

UPDATE course_instances ci
SET
  display_timezone = c.display_timezone
FROM
  pl_courses c
WHERE
  ci.display_timezone IS NULL
  AND c.id = ci.course_id;

ALTER TABLE pl_courses
ALTER COLUMN display_timezone
SET NOT NULL;

ALTER TABLE course_instances
ALTER COLUMN display_timezone
SET NOT NULL;
