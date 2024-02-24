-- BLOCK setup_cia_generic_tests
WITH
  setup_user AS (
    INSERT INTO
      users (
        user_id,
        uid,
        lti_course_instance_id,
        institution_id
      )
    VALUES
      (100, 'normaluser@host.com', null, 1),
      (101, 'ltiuserci1@host.com', 1, 2),
      (102, 'ltiuserci2@host.com', 2, 2)
  ),
  setup_course AS (
    INSERT INTO
      pl_courses (id, display_timezone, path)
    VALUES
      (1, 'UTC', '/path/to/course/1')
  ),
  setup_ci AS (
    INSERT INTO
      course_instances (id, uuid, course_id, display_timezone)
    VALUES
      (
        1,
        '5159a291-566f-4463-8f11-b07c931ad72a',
        1,
        'UTC'
      ),
      (
        2,
        '5159a291-566f-4463-8f11-b07c931ad72b',
        1,
        'UTC'
      )
  ),
  setup_ciars AS (
    INSERT INTO
      course_instance_access_rules (
        id,
        course_instance_id,
        number,
        uids,
        start_date,
        end_date,
        institution
      )
    VALUES
      (
        1,
        1,
        1,
        '{"person1@host.com", "person2@host.com"}',
        '2010-01-01 00:00:00-00',
        '2010-12-31 23:59:59-00',
        'Any'
      ),
      (
        2,
        1,
        2,
        null,
        '2011-01-01 00:00:00-00',
        '2011-12-31 23:59:59-00',
        'school'
      ),
      (
        3,
        1,
        3,
        null,
        '2012-01-01 00:00:00-00',
        '2012-12-31 23:59:59-00',
        'notInDb'
      ),
      (
        4,
        1,
        4,
        null,
        '2013-01-01 00:00:00-00',
        '2013-12-31 23:59:59-00',
        null
      ),
      (
        5,
        1,
        5,
        null,
        '2013-01-01 00:00:00-00',
        '2013-12-31 23:59:59-00',
        'LTI'
      )
  ),
  setup_institutions AS (
    INSERT INTO
      institutions (id, short_name, long_name, uid_regexp)
    VALUES
      (100, 'host', 'Generic host', '@host\.com$'),
      (
        101,
        'school',
        'School of testing',
        '@school\.edu$'
      ),
      (
        102,
        'anotherschool',
        'Another School',
        '@anotherschool\.edu$'
      )
  )
SELECT
  true;

-- BLOCK ciar_test
SELECT
  *
FROM
  course_instance_access_rules AS ciar,
  (
    SELECT
      id
    FROM
      institutions
    WHERE
      $uid ~ uid_regexp
  ) AS user_institution (user_institution_id),
  (
    SELECT
      id
    FROM
      institutions
    WHERE
      short_name = $short_name
  ) AS course_institution (course_institution_id),
  check_course_instance_access_rule (
    ciar,
    $uid,
    user_institution_id,
    course_institution_id,
    $date
  ) AS authorized
WHERE
  ciar.id = $ciar_id;

-- BLOCK cia_test
SELECT
  *
FROM
  (
    SELECT
      id
    FROM
      institutions
    WHERE
      $uid ~ uid_regexp
  ) AS user_institution (user_institution_id),
  check_course_instance_access ($ci_id, $uid, user_institution_id, $date) AS authorized;
