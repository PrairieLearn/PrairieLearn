-- BLOCK select_shared_questions
SELECT
  q.id,
  q.qid,
  q.share_publicly
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND (
    q.share_publicly
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
  q.share_publicly,
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

-- BLOCK check_question_used_in_other_courses
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessment_questions AS aq
      JOIN assessments AS a ON (a.id = aq.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
      aq.question_id = $question_id
      AND c.id != $course_id
      AND aq.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND ci.deleted_at IS NULL
      AND c.deleted_at IS NULL
  ) AS used;
