-- BLOCK insert_exam_metadata
WITH
  courses AS (
    INSERT INTO
      pt_courses (name, term, end_date)
    VALUES
      ('TAM 212', 'Fa26', NOW() + INTERVAL '1 year'),
      ('TAM 212', 'Sp26', NOW() - INTERVAL '1 year')
    RETURNING
      *
  ),
  centers AS (
    INSERT INTO
      pt_centers (name, term, end_date)
    VALUES
      ('CBTF', 'Fa26', NOW() + INTERVAL '1 year'),
      ('CBTF', 'Sp26', NOW() - INTERVAL '1 year'),
      ('DRES', 'Fa26', NOW() + INTERVAL '1 year')
    RETURNING
      *
  ),
  center_courses AS (
    INSERT INTO
      pt_center_courses (center_id, course_id)
    SELECT
      centers.id,
      courses.id
    FROM
      centers
      CROSS JOIN courses
    RETURNING
      *
  ),
  exams AS (
    INSERT INTO
      pt_exams (uuid, name, course_id)
    SELECT
      exam.uuid::uuid,
      'Exam 3',
      courses.id
    FROM
      (
        VALUES
          (
            '09bbefec-6c71-487a-9352-c1b131bb0001',
            'Fa26',
            'Fa26'
          ),
          (
            '09bbefec-6c71-487a-9352-c1b131bb0002',
            'Fa26',
            'Sp26'
          ),
          (
            '09bbefec-6c71-487a-9352-c1b131bb0003',
            'Sp26',
            'Fa26'
          ),
          (
            '09bbefec-6c71-487a-9352-c1b131bb0004',
            'Sp26',
            'Sp26'
          )
      ) AS exam (uuid, course_term, center_term)
      JOIN courses ON courses.term = exam.course_term
    RETURNING
      *
  )
INSERT INTO
  pt_center_exams (exam_id, center_course_id)
SELECT
  exams.id,
  center_courses.id
FROM
  exams
  JOIN center_courses ON center_courses.course_id = exams.course_id
  JOIN centers ON centers.id = center_courses.center_id
WHERE
  (
    RIGHT(exams.uuid::text, 1) IN ('1', '3')
    AND centers.term = 'Fa26'
  )
  OR (
    RIGHT(exams.uuid::text, 1) IN ('2', '4')
    AND centers.term = 'Sp26'
  );
