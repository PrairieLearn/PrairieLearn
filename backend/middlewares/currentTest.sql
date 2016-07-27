-- BLOCK test
SELECT t.*
FROM
    tests AS t,
    users AS u,
    LATERAL check_test_access(t.id, $mode::enum_mode, $role::enum_role, u.uid, current_timestamp) AS cta
WHERE
    t.id = $testId
    AND u.id = $userId
    AND t.deleted_at IS NULL
    AND t.course_instance_id = $courseInstanceId
    AND cta.available;

-- BLOCK test_set
SELECT ts.*
FROM tests as t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.id = $testId
AND t.course_instance_id = $courseInstanceId;
