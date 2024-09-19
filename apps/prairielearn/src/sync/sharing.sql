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

-- BLOCK select_sharing_set_questions
SELECT
  q.id,
  q.qid,
  q.shared_publicly,
  (
    SELECT
      jsonb_agg(to_jsonb(ss))
    FROM
      sharing_set_questions AS ssq
      JOIN sharing_sets AS ss on (ss.id = ssq.sharing_set_id)
    WHERE
      ssq.question_id = q.id
  ) AS sharing_sets,
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
GROUP BY
  q.id,
ORDER BY
  q.qid;
