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

-- BLOCK delete_sharing_set
DELETE FROM sharing_sets
WHERE
  course_id = $course_id
  AND name = $name;

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
  ) AS question_count
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
