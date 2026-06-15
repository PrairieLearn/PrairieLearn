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

-- BLOCK select_blocked_sharing_set_deletions
SELECT
  ss.name
FROM
  sharing_sets AS ss
WHERE
  ss.course_id = $course_id
  AND NOT (ss.name = ANY ($sharing_set_names::text[]))
  AND (
    EXISTS (
      SELECT
        1
      FROM
        sharing_set_questions AS ssq
      WHERE
        ssq.sharing_set_id = ss.id
    )
    OR EXISTS (
      SELECT
        1
      FROM
        sharing_set_courses AS ssc
      WHERE
        ssc.sharing_set_id = ss.id
    )
  );

-- BLOCK select_in_use_question_sharing_set_removals
SELECT DISTINCT
  q.qid,
  spec.sharing_set_name
FROM
  jsonb_to_recordset($removed_question_sharing_sets::jsonb) AS spec (question_id bigint, sharing_set_name text)
  JOIN questions AS q ON q.id = spec.question_id
  JOIN sharing_sets AS ss ON ss.name = spec.sharing_set_name
  AND ss.course_id = $course_id
  JOIN sharing_set_courses AS ssc ON ssc.sharing_set_id = ss.id
  JOIN course_instances AS ci ON ci.course_id = ssc.course_id
  JOIN assessments AS a ON a.course_instance_id = ci.id
  JOIN assessment_questions AS aq ON aq.assessment_id = a.id
  AND aq.question_id = q.id
WHERE
  q.deleted_at IS NULL
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND aq.deleted_at IS NULL;

-- BLOCK select_questions_blocking_unshare
SELECT
  q.id,
  q.qid,
  bool_or(ci.course_id != $course_id) AS used_in_other_course,
  bool_or(
    a.share_source_publicly
    AND ci.course_id = $course_id
  ) AS used_in_public_assessment
FROM
  questions AS q
  JOIN assessment_questions AS aq ON aq.question_id = q.id
  JOIN assessments AS a ON a.id = aq.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id
WHERE
  q.id = ANY ($question_ids::bigint[])
  AND q.deleted_at IS NULL
  AND aq.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
GROUP BY
  q.id,
  q.qid
HAVING
  bool_or(ci.course_id != $course_id)
  OR bool_or(
    a.share_source_publicly
    AND ci.course_id = $course_id
  );

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
