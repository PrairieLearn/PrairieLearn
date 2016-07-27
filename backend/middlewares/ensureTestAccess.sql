-- BLOCK test_instance
SELECT ti.*
FROM test_instances AS ti
WHERE ti.id = $testInstanceId
AND ti.user_id = $userId;

-- BLOCK test
SELECT t.*
FROM tests as t
WHERE t.id = $testId
AND t.deleted_at IS NULL
AND t.course_instance_id = $courseInstanceId;

-- BLOCK test_set
SELECT ts.*
FROM tests as t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.id = $testId
AND t.course_instance_id = $courseInstanceId;
