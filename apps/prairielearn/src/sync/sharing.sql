-- BLOCK select_shared_questions
SELECT
  q.id,
  q.qid
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND (
    q.shared_publicly
    OR EXISTS (
      SELECT
        1
      FROM
        sharing_set_questions
      WHERE
        question_id = q.id
    )
  );
