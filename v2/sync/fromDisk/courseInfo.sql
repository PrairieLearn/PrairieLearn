-- BLOCK insert_course
INSERT INTO courses
        (short_name,  title,  path,  grading_queue)
VALUES ($short_name, $title, $path, $grading_queue)
ON CONFLICT (short_name) DO UPDATE
SET
    title = EXCLUDED.title,
    path = EXCLUDED.path,
    grading_queue = EXCLUDED.grading_queue
RETURNING id AS course_id;
