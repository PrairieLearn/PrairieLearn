-- BLOCK select_question_for_file
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
  AND qid = ANY ($qids::text[])
ORDER BY
  length(qid)
LIMIT
  1;

-- BLOCK question_identity_exists
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions
    WHERE
      course_id = $course_id
      AND (
        uuid = $uuid
        OR (
          qid = $qid
          AND deleted_at IS NULL
        )
      )
  );
