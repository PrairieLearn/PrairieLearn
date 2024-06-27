-- BLOCK qids
SELECT
  q.qid AS qids
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.qid IS NOT NULL;

-- BLOCK select_question_id_from_uuid
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;

-- BLOCK select_assessments_with_question_for_display
SELECT
  jsonb_build_object(
    'short_name',
    result.course_short_name,
    'long_name',
    result.course_long_name,
    'course_instance_id',
    result.course_instance_id,
    'assessments',
    result.matched_assessments
  )
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
          admin_assessment_question_number (aq.id)
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

-- BLOCK select_sharing_sets
SELECT
  ss.id,
  ss.name,
  ssq.question_id IS NOT NULL as in_set
FROM
  sharing_sets AS ss
  LEFT OUTER JOIN (
    SELECT
      *
    FROM
      sharing_set_questions
    WHERE
      question_id = $question_id
  ) AS ssq ON ssq.sharing_set_id = ss.id
WHERE
  ss.course_id = $course_id;
