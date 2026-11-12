-- BLOCK insert_questions
INSERT INTO
  questions (
    course_id,
    qid,
    title,
    authors,
    copied_from,
    copied_from_question_id,
    deleted_at,
    draft
  )
SELECT
  $course_id::bigint,
  'authorship-' || lpad(i::text, 3, '0'),
  'Authorship question ' || i,
  CASE
    WHEN i = 1 THEN ARRAY['author-a', 'author-b']
    ELSE ARRAY['author-a']
  END,
  CASE
    WHEN i = 1 THEN '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222'
    ELSE NULL
  END,
  CASE
    WHEN i = 2 THEN (
      SELECT
        id
      FROM
        questions
      WHERE
        course_id = $course_id
        AND qid = 'addNumbers'
    )
    ELSE NULL
  END,
  CASE
    WHEN i = 51 THEN now()
    ELSE NULL
  END,
  i = 3
FROM
  generate_series(1, 51) AS i;

-- BLOCK delete_questions
DELETE FROM questions
WHERE
  course_id = $course_id
  AND qid LIKE 'authorship-%';
