-- BLOCK test_instance
SELECT ti.*
FROM test_instances AS ti
WHERE ti.id = $test_instance_id
AND ti.user_id = $user_id;

-- BLOCK test
SELECT t.*
FROM tests as t
WHERE t.id = $test_id
AND t.deleted_at IS NULL
AND t.course_instance_id = $course_instance_id;

-- BLOCK test_set
SELECT ts.*
FROM tests as t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.id = $test_id
AND t.course_instance_id = $course_instance_id;
