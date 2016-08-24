INSERT INTO courses (short_name, title, path) VALUES ($1, $2, $3)
    ON CONFLICT (short_name) DO UPDATE
SET
    title = EXCLUDED.title,
    path = EXCLUDED.path
RETURNING id AS course_id;
