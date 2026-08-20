-- BLOCK select_questions
SELECT
  q.id AS question_id,
  q.qid,
  q.title,
  top.name AS topic,
  COALESCE(
    (
      SELECT
        ARRAY_AGG(
          t.name
          ORDER BY
            t.name
        )
      FROM
        question_tags AS qt
        JOIN tags AS t ON (t.id = qt.tag_id)
      WHERE
        qt.question_id = q.id
    ),
    ARRAY[]::text[]
  ) AS tags,
  q.grading_method::text AS grading_method,
  q.draft
FROM
  questions AS q
  LEFT JOIN topics AS top ON (top.id = q.topic_id)
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
ORDER BY
  q.qid;

-- BLOCK select_course_instances
SELECT
  ci.id AS course_instance_id,
  ci.short_name,
  ci.long_name,
  (
    SELECT
      COUNT(*)::int
    FROM
      assessments AS a
    WHERE
      a.course_instance_id = ci.id
      AND a.deleted_at IS NULL
  ) AS assessment_count
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
ORDER BY
  ci.short_name;

-- BLOCK select_assessments
SELECT
  a.id AS assessment_id,
  a.tid,
  a.title,
  a.type::text AS type,
  ci.short_name AS course_instance_short_name,
  (
    SELECT
      COUNT(*)::int
    FROM
      assessment_questions AS aq
    WHERE
      aq.assessment_id = a.id
      AND aq.deleted_at IS NULL
  ) AS question_count
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  ci.course_id = $course_id
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
ORDER BY
  ci.short_name,
  a.tid;
