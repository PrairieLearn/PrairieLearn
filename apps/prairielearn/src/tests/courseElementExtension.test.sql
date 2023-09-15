-- BLOCK select_question_by_qid
SELECT
  *
FROM
  questions
WHERE
  qid = $qid;
