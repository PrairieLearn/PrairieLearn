WITH
    multiple_instance_tests AS (
        SELECT
            t.id AS test_id,
            t.number AS test_number,
            t.title AS test_title,
            ts.id AS test_set_id,
            ts.abbrev AS test_set_abbrev,
            ts.name AS test_set_name,
            ts.heading AS test_set_heading,
            ts.color AS test_set_color,
            ts.number AS test_set_number,
            cta.available,
            cta.credit,
            NULL::integer AS test_instance_id,
            NULL::integer AS test_instance_number
        FROM
            tests AS t
            JOIN test_sets AS ts ON (ts.id = t.test_set_id)
            LEFT JOIN LATERAL check_test_access(t.id, $mode::enum_mode, $role::enum_role, $uid, current_timestamp) AS cta ON TRUE
        WHERE
            t.multiple_instance
            AND t.deleted_at IS NULL
            AND t.course_instance_id = $courseInstanceId
    ),

    multiple_instance_test_instances AS (
        SELECT
            mit.test_id,
            mit.test_number,
            mit.test_title,
            mit.test_set_id,
            mit.test_set_abbrev,
            mit.test_set_name,
            mit.test_set_heading,
            mit.test_set_color,
            mit.test_set_number,
            mit.available,
            mit.credit,
            ti.id AS test_instance_id,
            ti.number AS test_instance_number
        FROM
            test_instances AS ti
            JOIN multiple_instance_tests AS mit ON (mit.test_id = ti.test_id)
        WHERE
            ti.user_id = $userId
    ),

    single_instance_tests AS (
        SELECT
            t.id AS test_id,
            t.number AS test_number,
            t.title AS test_title,
            ts.id AS test_set_id,
            ts.abbrev AS test_set_abbrev,
            ts.name AS test_set_name,
            ts.heading AS test_set_heading,
            ts.color AS test_set_color,
            ts.number AS test_set_number,
            cta.available,
            cta.credit,
            ti.id AS test_instance_id,
            ti.number AS test_instance_number
        FROM
            tests AS t
            JOIN test_sets AS ts ON (ts.id = t.test_set_id)
            LEFT JOIN test_instances AS ti ON (ti.test_id = t.id AND ti.user_id = $userId)
            LEFT JOIN LATERAL check_test_access(t.id, $mode::enum_mode, $role::enum_role, $uid, current_timestamp) AS cta ON TRUE
        WHERE
            NOT t.multiple_instance
            AND t.deleted_at IS NULL
            AND t.course_instance_id = $courseInstanceId
    ),

    all_rows AS (
        SELECT * FROM multiple_instance_tests
        UNION
        SELECT * FROM multiple_instance_test_instances
        UNION
        SELECT * FROM single_instance_tests
    )

SELECT
    *,
    (lag(test_set_id) OVER (PARTITION BY test_set_id ORDER BY test_number, test_id) IS NULL) AS start_new_set
FROM
    all_rows
WHERE
    available
ORDER BY
    test_set_number, test_number, test_id, test_instance_number NULLS FIRST;
