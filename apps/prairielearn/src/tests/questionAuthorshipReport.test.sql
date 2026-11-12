-- BLOCK set_authors
UPDATE questions
SET
  authors = CASE
    WHEN qid = 'addNumbers' THEN ARRAY[$author_uid, 'external']
    WHEN qid = 'addVectors' THEN ARRAY[$author_uid]
    ELSE '{}'::text[]
  END,
  deleted_at = CASE
    WHEN qid = 'addNumbers' THEN now()
    ELSE deleted_at
  END
WHERE
  course_id = 1;

-- BLOCK insert_copies
WITH
  institution AS (
    INSERT INTO
      institutions (short_name, long_name)
    VALUES
      ('report', 'Report institution')
    RETURNING
      id
  ),
  courses AS (
    INSERT INTO
      courses (
        short_name,
        path,
        display_timezone,
        institution_id,
        deleted_at
      )
    SELECT
      name,
      '/report/' || name,
      'UTC',
      institution.id,
      CASE
        WHEN name = 'report-B' THEN now()
        ELSE NULL
      END
    FROM
      institution
      CROSS JOIN (
        VALUES
          ('report-B'),
          ('report-C')
      ) AS names (name)
    RETURNING
      id,
      short_name
  )
INSERT INTO
  questions (course_id, qid, title, uuid, deleted_at)
SELECT
  courses.id,
  copies.qid,
  copies.qid,
  gen_random_uuid(),
  CASE
    WHEN copies.deleted THEN now()
    ELSE NULL
  END
FROM
  courses
  JOIN (
    VALUES
      ('report-B', 'report-b1', true),
      ('report-B', 'report-b2', false),
      ('report-C', 'report-c', true)
  ) AS copies (course, qid, deleted) ON copies.course = courses.short_name;

-- BLOCK connect_copies
-- A -> B1 -> C -> A, A -> B2; B and C share an institution.
-- Deleted A/B1/C and course B must remain traversable. addVectors is a self-loop.
UPDATE questions AS child
SET
  copied_from_question_id = source.id,
  copied_from = course.uuid::text || '/' || source.uuid::text
FROM
  (
    VALUES
      ('report-b1', 'addNumbers'),
      ('report-b2', 'addNumbers'),
      ('report-c', 'report-b1'),
      ('addNumbers', 'report-c'),
      ('addVectors', 'addVectors')
  ) AS edges (child_qid, source_qid)
  JOIN questions AS source ON source.qid = edges.source_qid
  JOIN courses AS course ON course.id = source.course_id
WHERE
  child.qid = edges.child_qid;
