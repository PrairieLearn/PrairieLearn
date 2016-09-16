-- BLOCK insert_course
INSERT INTO courses
        (short_name,  title,  path)
VALUES ($short_name, $title, $path)
ON CONFLICT (short_name) DO UPDATE
SET
    title = EXCLUDED.title,
    path = EXCLUDED.path
RETURNING id AS course_id;
