-- BLOCK insert_course
UPDATE courses AS c
SET
    short_name = $short_name,
    title = $title,
    grading_queue = $grading_queue
WHERE
    c.id = $course_id
RETURNING
    c.id;
