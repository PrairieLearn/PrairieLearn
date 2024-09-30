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

-- BLOCK select_sharing_set_questions
SELECT
  *
FROM
  (
    SELECT
      q.id,
      q.qid,
      q.shared_publicly,
      (
        SELECT
          jsonb_agg(ss.name)
        FROM
          sharing_set_questions AS ssq
          JOIN sharing_sets AS ss on (ss.id = ssq.sharing_set_id)
        WHERE
          ssq.question_id = q.id
      ) AS sharing_sets
    FROM
      questions AS q
    WHERE
      q.course_id = $course_id
      AND q.deleted_at IS NULL
    GROUP BY
      q.id
    ORDER BY
      q.qid
  ) as f
WHERE
  sharing_sets IS NOT NULL;
