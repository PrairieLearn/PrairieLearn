-- BLOCK setup_caa_scheduler_tests
WITH
  setup_users AS (
    INSERT INTO
      users (user_id, uid)
    VALUES
      (1000, 'student@school.edu'),
      (1010, 'ta@school.edu'),
      (1020, 'instructor@school.edu')
  ),
  setup_pl_course AS (
    INSERT INTO
      pl_courses (id, display_timezone, path)
    VALUES
      (1, 'UTC', '/path/to/course/1'),
      (2, 'UTC', '/path/to/course/2'),
      (3, 'UTC', '/path/to/course/3')
  ),
  setup_ci AS (
    INSERT INTO
      course_instances (id, uuid, course_id, display_timezone)
    VALUES
      (
        1,
        'b3d010d2-dbef-4b5b-ba4d-92f9aea25c8d',
        1,
        'UTC'
      ),
      (
        2,
        '5756a615-cdc4-48e6-9836-79fb708a2f55',
        2,
        'UTC'
      ),
      (
        3,
        '335c2f78-f8d3-4a14-99da-53af231b0428',
        3,
        'UTC'
      ),
      (
        4,
        '2256b06e-c00a-4596-a3b2-510f159d36d5',
        3,
        'UTC'
      )
  ),
  setup_assessment_sets AS (
    INSERT INTO
      assessment_sets (id, course_id)
    VALUES
      (1, 1),
      (2, 2),
      (3, 3)
  ),
  setup_assessments AS (
    INSERT INTO
      assessments (
        id,
        uuid,
        tid,
        title,
        course_instance_id,
        assessment_set_id
      )
    VALUES
      (
        10,
        '423e8913-0608-4c85-9b2e-bca9c81f52d3',
        'someExam',
        'Some Exam',
        1,
        1
      ),
      (
        11,
        'a0b4cd67-931d-4173-b722-23d3f3a359a5',
        'someExam',
        'Some Exam',
        1,
        1
      ),
      (
        12,
        '91fac0da-e943-4775-83ff-aef9487a1c9f',
        'someExam',
        'Some Exam',
        1,
        1
      ),
      (
        13,
        '794666e4-bbf9-47c1-9613-6bf2057dbd1c',
        'someExam',
        'Some Exam',
        1,
        1
      ),
      (
        20,
        '71b1cf06-6494-4491-bc05-cba7f93dacfd',
        'someExam',
        'Some Exam',
        2,
        2
      ),
      (
        21,
        '5fe78f9c-bfeb-4065-a9f3-20ec0c00140f',
        'someExam',
        'Some Exam',
        2,
        2
      ),
      (
        22,
        'd803d2df-000c-4949-b25b-d7781c31d726',
        'someExam',
        'Some Exam',
        2,
        2
      ),
      (
        23,
        '0727036e-43a2-467c-a0ee-b1df8ffe7096',
        'someExam',
        'Some Exam',
        2,
        2
      ),
      (
        30,
        '3538dfb4-c0e4-4be6-80e1-a7f294904fc7',
        'someExam',
        'Some Exam',
        3,
        3
      ),
      (
        31,
        '2cf82007-d760-4f29-8755-42e7089c5352',
        'someExam',
        'Some Exam',
        3,
        3
      ),
      (
        32,
        '5f2e00b7-6ec4-4422-a8c4-dce04f6b6b05',
        'someExam',
        'Some Exam',
        3,
        3
      ),
      (
        40,
        '24fc184d-656b-44e5-979a-33e4d41abebd',
        'someExam',
        'Some Exam',
        4,
        3
      ),
      (
        41,
        '6a4eba13-930d-4e1b-99db-0a5b4205cf83',
        'someExam',
        'Some Exam',
        4,
        3
      ),
      (
        42,
        '85830431-0317-4a75-84d6-d9baf68e33a7',
        'someExam',
        'Some Exam',
        4,
        3
      ),
      (
        43,
        '494ec9c0-4599-4539-92b4-ad0ed1c08b4f',
        'someExam',
        'Some Exam',
        4,
        3
      )
  ),
  setup_assessment_access_rule AS (
    INSERT INTO
      assessment_access_rules (
        assessment_id,
        mode,
        start_date,
        end_date,
        credit,
        exam_uuid
      )
    VALUES
      (
        10,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        null
      ),
      (
        11,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        '890884f9-aa9d-4fc0-b910-5229794906fb'
      ),
      (
        12,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        '40dec9a8-a5c6-476d-afd6-3ab52e3d0ed3'
      ),
      (
        13,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        null
      ),
      (
        20,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        null
      ),
      (
        21,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        'fa71b9cc-7717-4e84-9a1e-8d55b3d4fadd'
      ),
      (
        22,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        '40dec9a8-a5c6-476d-afd6-3ab52e3d0ed3'
      ),
      (
        23,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        null
      ),
      (
        40,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        null
      ),
      (
        41,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        'adf9ce2d-dfca-4a7f-8c6b-1376715fd346'
      ),
      (
        42,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        '40dec9a8-a5c6-476d-afd6-3ab52e3d0ed3'
      ),
      (
        43,
        'Exam',
        '2010-01-01 00:00:01-00',
        '2010-12-31 23:59:59-00',
        100,
        null
      )
  )
SELECT
  true;
