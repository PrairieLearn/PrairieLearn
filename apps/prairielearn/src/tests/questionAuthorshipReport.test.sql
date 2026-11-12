-- BLOCK insert_institution
INSERT INTO
  institutions (id, short_name, long_name)
VALUES
  (-1, 'report', 'Report institution');

-- BLOCK insert_courses
INSERT INTO
  courses (
    id,
    path,
    display_timezone,
    institution_id,
    deleted_at
  )
VALUES
  (1, '/A', 'UTC', 1, NULL),
  (2, '/B', 'UTC', -1, now()),
  (3, '/C', 'UTC', -1, NULL);

-- BLOCK insert_questions
-- root -> direct -> indirect -> root; root -> duplicate (also in course B).
-- The deleted rows remain in the graph. self has no external adoption.
INSERT INTO
  questions (
    id,
    course_id,
    qid,
    authors,
    copied_from_question_id,
    deleted_at
  )
VALUES
  (
    1,
    1,
    'root',
    ARRAY['author', 'external'],
    4,
    now()
  ),
  (2, 2, 'direct', '{}', 1, now()),
  (3, 2, 'duplicate', '{}', 1, NULL),
  (4, 3, 'indirect', '{}', 2, now()),
  (5, 1, 'self', ARRAY['author'], 5, NULL);

-- BLOCK insert_long_chain
-- Only links 20 and 21 leave the source course, so the counts test the boundary.
INSERT INTO
  questions (id, course_id, qid, copied_from_question_id)
SELECT
  100 + depth,
  CASE
    WHEN depth < 20 THEN 1
    WHEN depth = 20 THEN 2
    ELSE 3
  END,
  'depth-' || depth,
  CASE
    WHEN depth = 0 THEN NULL
    ELSE 99 + depth
  END
FROM
  generate_series(0, 21) AS depth;
