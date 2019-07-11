-- BLOCK update_course
UPDATE pl_courses AS c
SET
    short_name = $short_name,
    title = $title,
    display_timezone = CASE WHEN $display_timezone::text IS NOT NULL THEN $display_timezone::text ELSE display_timezone END,
    grading_queue = $grading_queue,
    options = $options
WHERE
    c.id = $course_id
RETURNING
    c.*;
