-- BLOCK test
SELECT t.*
FROM tests as t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.id = $1
AND t.deleted_at IS NULL
AND t.course_instance_id = $2;

-- BLOCK test_set
SELECT ts.*
FROM tests as t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.id = $1
AND t.course_instance_id = $2;
