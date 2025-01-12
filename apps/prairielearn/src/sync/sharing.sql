-- BLOCK select_shared_questions
SELECT
  q.id,
  q.qid,
  q.shared_publicly
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

-- BLOCK select_sharing_sets
SELECT
  ss.name
FROM
  sharing_sets AS ss
WHERE
  ss.course_id = $course_id;

-- BLOCK select_question_sharing_sets
WITH
  sharing_sets_agg AS (
    SELECT
      ssq.question_id,
      jsonb_agg(ss.name) AS sharing_sets
    FROM
      sharing_set_questions AS ssq
      JOIN sharing_sets AS ss ON ss.id = ssq.sharing_set_id
    WHERE
      ss.course_id = $course_id
    GROUP BY
      ssq.question_id
  )
SELECT
  q.id,
  q.qid,
  q.shared_publicly,
  ssa.sharing_sets
FROM
  questions AS q
  LEFT JOIN sharing_sets_agg AS ssa ON ssa.question_id = q.id
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND ssa.sharing_sets IS NOT NULL
ORDER BY
  q.qid;
