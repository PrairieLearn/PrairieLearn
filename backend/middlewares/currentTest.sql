-- BLOCK test
SELECT
    t.*,
    cta.credit
FROM
    tests AS t,
    users AS u,
    LATERAL check_test_access(t.id, $mode::enum_mode, $role::enum_role, u.uid, current_timestamp) AS cta
WHERE
    t.id = $test_id
    AND u.id = $user_id
    AND t.deleted_at IS NULL
    AND t.course_instance_id = $course_instance_id
    AND cta.available;

-- BLOCK test_set
SELECT ts.*
FROM tests as t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.id = $test_id
AND t.course_instance_id = $course_instance_id;
