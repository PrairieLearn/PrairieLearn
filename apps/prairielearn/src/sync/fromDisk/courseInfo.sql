-- BLOCK update_course
UPDATE pl_courses AS c
SET
  short_name = $short_name,
  title = $title,
  display_timezone = CASE
    WHEN $display_timezone::text IS NOT NULL THEN $display_timezone::text
    ELSE display_timezone
  END,
  example_course = $example_course,
  options = $options,
  sync_errors = NULL,
  sync_warnings = $sync_warnings
WHERE
  c.id = $course_id
RETURNING
  c.*;

-- BLOCK update_course_errors
UPDATE pl_courses AS c
SET
  sync_errors = $sync_errors,
  sync_warnings = $sync_warnings
WHERE
  c.id = $course_id
RETURNING
  c.*;
