-- BLOCK assessment_question_stats
SELECT
  c.short_name AS course_short_name,
  ci.short_name AS course_instance_short_name,
  (aset.abbreviation || a.number) as assessment_label,
  aset.color AS assessment_color,
  a.id AS assessment_id,
  a.type AS assessment_type,
  a.course_instance_id,
  q.qid,
  q.title AS question_title,
  admin_assessment_question_number (aq.id) as assessment_question_number,
  aq.*
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id),
  LATERAL (
    SELECT
      min(ar.start_date) AS start_date,
      max(ar.end_date) AS end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
  ) AS d
WHERE
  aq.question_id = $question_id
  AND aq.deleted_at IS NULL
ORDER BY
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC,
  aset.number,
  a.order_by,
  a.id;
