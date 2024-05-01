-- BLOCK select_shared_questions
SELECT
  id,
  qid
FROM
  questions
WHERE
  course_id = $course_id
  AND shared_publicly
UNION
SELECT DISTINCT
  (q.id),
  q.qid
FROM
  questions AS q
  JOIN sharing_set_questions AS ssq ON ssq.question_id = q.id
WHERE
  q.course_id = $course_id;

-- BLOCK select_shared_questions_test
SELECT
  id,
  qid
FROM
  questions
WHERE
  course_id = 3
  AND shared_publicly
UNION
SELECT DISTINCT
  (q.id),
  q.qid
FROM
  questions AS q
  JOIN sharing_set_questions AS ssq ON ssq.question_id = q.id
WHERE
  q.course_id = 3;
