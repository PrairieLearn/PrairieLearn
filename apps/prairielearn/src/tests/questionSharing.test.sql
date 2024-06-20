-- BLOCK get_question_id
SELECT
  id
FROM
  questions
WHERE
  course_id = $course_id
  and qid = $qid;
