-- BLOCK setup_cia_generic_tests
WITH
setup_course AS (
    INSERT INTO pl_courses (id) VALUES (1)
),
setup_ci AS (
    INSERT INTO course_instances (id, uuid, course_id) VALUES
        (1, '5159a291-566f-4463-8f11-b07c931ad72a', 1)
),
setup_ciars AS (
    INSERT INTO course_instance_access_rules
        (id, course_instance_id, number, role, uids, start_date, end_date, institution) VALUES
        (1, 1, 1, 'TA', '{"person1@host.com", "person2@host.com"}', '2010-01-01 00:00:00-00', '2010-12-31 23:59:59-00', 'Any'),
        (2, 1, 2, null, null, '2011-01-01 00:00:00-00', '2011-12-31 23:59:59-00', 'school'),
        (3, 1, 3, null, null, '2012-01-01 00:00:00-00', '2012-12-31 23:59:59-00', 'notInDb')
),
setup_institutions AS (
    INSERT INTO institutions (id, short_name, long_name, uid_pattern) VALUES
        (100, 'school', 'School of testing', '%@school.edu')
)
SELECT true;

-- BLOCK ciar_test
SELECT
    *
FROM
    course_instance_access_rules AS ciar,
    check_course_instance_access_rule(ciar, $role, $uid, $date) AS authorized
WHERE
    ciar.id=$ciar_id;

-- BLOCK cia_test
SELECT
    *
FROM
    check_course_instance_access($ci_id, $role, $uid, $date) AS authorized
;
