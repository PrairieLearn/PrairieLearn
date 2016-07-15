INSERT INTO course_instances
    (course_id, short_name, long_name, number, start_date, end_date, deleted_at)
    VALUES ($1, $2, $3, $4, $5::TIMESTAMP WITH TIME ZONE, $6::TIMESTAMP WITH TIME ZONE, NULL)
ON CONFLICT (course_id, short_name) DO UPDATE
SET
    long_name = EXCLUDED.long_name,
    number = EXCLUDED.number,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    deleted_at = EXCLUDED.deleted_at
RETURNING *;
