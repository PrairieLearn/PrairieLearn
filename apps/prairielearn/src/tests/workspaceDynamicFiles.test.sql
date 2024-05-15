-- BLOCK select_test_question
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.qid = $qid;
