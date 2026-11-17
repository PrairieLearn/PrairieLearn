-- BLOCK select_sharing_set_by_name
SELECT
  *
FROM
  sharing_sets
WHERE
  course_id = $course_id
  AND name = $name;

-- BLOCK select_sharing_sets_for_question
WITH
  sharing_set_questions AS (
    SELECT
      *
    FROM
      sharing_set_questions
    WHERE
      question_id = $question_id
  )
SELECT
  ss.id,
  ss.name,
  ssq.question_id IS NOT NULL AS in_set
FROM
  sharing_sets AS ss
  LEFT OUTER JOIN sharing_set_questions AS ssq ON ssq.sharing_set_id = ss.id
WHERE
  ss.course_id = $course_id;

-- BLOCK select_question_sharing_constraints
SELECT
  COALESCE(bool_or(ci.course_id != $course_id), FALSE) AS used_in_other_course,
  COALESCE(
    bool_or(
      a.share_source_publicly
      AND ci.course_id = $course_id
    ),
    FALSE
  ) AS used_in_same_course_public_assessment
FROM
  questions AS q
  LEFT JOIN assessment_questions AS aq ON aq.question_id = q.id
  AND aq.deleted_at IS NULL
  LEFT JOIN assessments AS a ON a.id = aq.assessment_id
  AND a.deleted_at IS NULL
  LEFT JOIN course_instances AS ci ON ci.id = a.course_instance_id
  AND ci.deleted_at IS NULL
WHERE
  q.id = $question_id
  AND q.deleted_at IS NULL;

-- BLOCK select_locked_sharing_set_memberships
SELECT DISTINCT
  ss.name
FROM
  sharing_set_questions AS ssq
  JOIN sharing_sets AS ss ON ss.id = ssq.sharing_set_id
  JOIN sharing_set_courses AS ssc ON ssc.sharing_set_id = ss.id
  JOIN course_instances AS ci ON ci.course_id = ssc.course_id
  JOIN assessments AS a ON a.course_instance_id = ci.id
  JOIN assessment_questions AS aq ON aq.assessment_id = a.id
  AND aq.question_id = ssq.question_id
WHERE
  ssq.question_id = $question_id
  AND ss.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND aq.deleted_at IS NULL;

-- BLOCK select_sharing_set_usage
SELECT
  (
    SELECT
      COUNT(*)
    FROM
      sharing_set_questions AS ssq
      JOIN sharing_sets AS ss ON ss.id = ssq.sharing_set_id
    WHERE
      ss.course_id = $course_id
      AND ss.name = $name
  ) AS question_count,
  (
    SELECT
      COUNT(*)
    FROM
      sharing_set_courses AS ssc
      JOIN sharing_sets AS ss ON ss.id = ssc.sharing_set_id
    WHERE
      ss.course_id = $course_id
      AND ss.name = $name
  ) AS consumer_count;

-- BLOCK select_sharing_sets_for_course
SELECT
  ss.name,
  ss.id,
  ss.description,
  COALESCE(
    jsonb_agg(
      c.short_name
      ORDER BY
        c.short_name
    ) FILTER (
      WHERE
        c.short_name IS NOT NULL
    ),
    '[]'
  ) AS shared_with,
  (
    SELECT
      COUNT(*)::int
    FROM
      sharing_set_questions AS ssq
    WHERE
      ssq.sharing_set_id = ss.id
  ) AS question_count,
  (
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object('id', q.id, 'qid', q.qid)
          ORDER BY
            q.qid
        ),
        '[]'
      )
    FROM
      sharing_set_questions AS ssq
      JOIN questions AS q ON q.id = ssq.question_id
    WHERE
      ssq.sharing_set_id = ss.id
      AND q.deleted_at IS NULL
      AND q.qid IS NOT NULL
  ) AS questions
FROM
  sharing_sets AS ss
  LEFT JOIN sharing_set_courses AS css ON css.sharing_set_id = ss.id
  LEFT JOIN courses AS c ON c.id = css.course_id
WHERE
  ss.course_id = $course_id
GROUP BY
  ss.id
ORDER BY
  ss.name;
