INSERT INTO courses (short_name, title) VALUES ($1, $2)
ON CONFLICT (short_name) DO UPDATE
SET title = EXCLUDED.title
RETURNING id AS course_id;
