-- BLOCK setup_check_course_instance_legacy_access_tests
WITH
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
  ),
  setup_course AS (
    INSERT INTO
      courses (id, institution_id, display_timezone, path)
    VALUES
      (10, 1, 'UTC', '/path/to/course/10')
  ),
  setup_course_instances AS (
    INSERT INTO
      course_instances (
        id,
        uuid,
        course_id,
        display_timezone,
        enrollment_code
      )
    VALUES
      (
        11,
        '5159a291-566f-4463-8f11-b07c931ad711',
        10,
        'UTC',
        'KN5Y4HNHX1'
      ),
      (
        12,
        '5159a291-566f-4463-8f11-b07c931ad712',
        10,
        'UTC',
        'KN5Y4HNHX2'
      ),
      (
        13,
        '5159a291-566f-4463-8f11-b07c931ad713',
        10,
        'UTC',
        'KN5Y4HNHX3'
      ),
      (
        14,
        '5159a291-566f-4463-8f11-b07c931ad714',
        10,
        'UTC',
        'KN5Y4HNHX4'
      ),
      (
        15,
        '5159a291-566f-4463-8f11-b07c931ad715',
        10,
        'UTC',
        'KN5Y4HNHX5'
      ),
      (
        16,
        '5159a291-566f-4463-8f11-b07c931ad716',
        10,
        'UTC',
        'KN5Y4HNHX6'
      ),
      (
        17,
        '5159a291-566f-4463-8f11-b07c931ad717',
        10,
        'UTC',
        'KN5Y4HNHX7'
      )
  ),
  setup_users AS (
    INSERT INTO
      users (id, uid, institution_id, lti_course_instance_id)
    VALUES
      (1000, 'person1@host.com', 100, NULL),
      (1001, 'person2@host.com', 100, NULL),
      (1002, 'person1@school.edu', 101, NULL),
      (1003, 'user@school.edu', 101, NULL),
      (1004, 'unknown@host.com', 100, NULL),
      (1005, 'person1@anotherschool.edu', 102, NULL),
      (1006, 'defaultuser@example.com', 1, NULL),
      (1007, 'normaluser@host.com', 100, NULL),
      (1008, 'ltiuserci15@host.com', 100, 15),
      (1009, 'ltiuserci12@host.com', 100, 12)
  )
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
    21,
    11,
    1,
    '{"person1@host.com", "person2@host.com"}',
    '2010-01-01 00:00:00-00',
    '2010-12-31 23:59:59-00',
    'Any'
  ),
  (
    22,
    12,
    1,
    NULL,
    '2011-01-01 00:00:00-00',
    '2011-12-31 23:59:59-00',
    'school'
  ),
  (
    23,
    13,
    1,
    NULL,
    '2012-01-01 00:00:00-00',
    '2012-12-31 23:59:59-00',
    'notInDb'
  ),
  (24, 14, 1, NULL, NULL, NULL, NULL),
  (
    25,
    15,
    1,
    NULL,
    '2013-01-01 00:00:00-00',
    '2013-12-31 23:59:59-00',
    'LTI'
  ),
  (
    26,
    16,
    1,
    NULL,
    NULL,
    '2014-12-31 23:59:59-00',
    'Any'
  ),
  (
    27,
    17,
    1,
    NULL,
    '2015-01-01 00:00:00-00',
    NULL,
    'school'
  );
