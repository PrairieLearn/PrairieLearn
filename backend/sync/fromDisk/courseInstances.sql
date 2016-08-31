INSERT INTO course_instances
    (course_id, short_name, long_name, number, deleted_at)
    VALUES ($course_id, $short_name, $long_name, $number, NULL)
ON CONFLICT (course_id, short_name) DO UPDATE
SET
    long_name = EXCLUDED.long_name,
    number = EXCLUDED.number,
    deleted_at = EXCLUDED.deleted_at
RETURNING *;
