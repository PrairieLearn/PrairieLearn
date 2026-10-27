-- BLOCK qids
SELECT
  q.qid AS qids
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.qid IS NOT NULL;

-- BLOCK select_assessments_with_question_for_display
SELECT
  result.course_short_name AS short_name,
  result.course_long_name AS long_name,
  result.course_instance_id,
  result.matched_assessments AS assessments
FROM
  (
    SELECT
      ci.short_name AS course_short_name,
      ci.long_name AS course_long_name,
      ci.id AS course_instance_id,
      jsonb_agg(
        jsonb_build_object(
          'label',
          aset.abbreviation || a.number,
          'assessment_id',
          a.id,
          'color',
          aset.color,
          'title',
          a.title,
          'type',
          a.type
        )
        ORDER BY
          (aset.number, a.order_by, a.id)
      ) AS matched_assessments
    FROM
      assessment_questions AS aq
      JOIN assessments AS a ON (a.id = aq.assessment_id)
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
      aq.question_id = $question_id
      AND aq.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND ci.deleted_at IS NULL
    GROUP BY
      ci.id
    ORDER BY
      ci.id
  ) AS result;

-- BLOCK select_authors
WITH
  authors AS (
    SELECT
      author.uid,
      author.ordinality
    FROM
      questions AS q
      CROSS JOIN LATERAL unnest(q.authors) WITH ORDINALITY AS author (uid, ordinality)
    WHERE
      q.id = $question_id
      AND q.course_id = $course_id
  )
SELECT
  author.uid,
  CASE
    WHEN cp.user_id IS NOT NULL THEN u.name
    ELSE NULL
  END AS name,
  author.ordinality
FROM
  authors AS author
  LEFT JOIN users AS u ON (u.uid = author.uid)
  LEFT JOIN course_permissions AS cp ON (
    cp.user_id = u.id
    AND cp.course_id = $course_id
  )
UNION ALL
-- Resolve newly entered UIDs before the form is saved, too.
SELECT
  u.uid,
  u.name,
  NULL::bigint AS ordinality
FROM
  course_permissions AS cp
  JOIN users AS u ON (u.id = cp.user_id)
WHERE
  cp.course_id = $course_id
  AND NOT EXISTS (
    SELECT
      1
    FROM
      authors
    WHERE
      authors.uid = u.uid
  )
ORDER BY
  ordinality;
