-- BLOCK select_is_shared
SELECT
  EXISTS (
    SELECT
      *
    FROM
      sharing_set_questions
    WHERE
      question_id = $question_id
  )
  OR EXISTS (
    SELECT
      *
    FROM
      questions
    WHERE
      id = $question_id
      AND shared_publicly
  );
