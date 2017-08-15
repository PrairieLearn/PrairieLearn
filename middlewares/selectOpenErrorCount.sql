-- BLOCK select_open_error_count
SELECT count(*)::int
FROM errors AS e
WHERE
    e.course_id = $course_id
    AND e.course_caused
    AND e.open;
