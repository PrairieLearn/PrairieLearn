-- BLOCK select_assessment_question_context
SELECT
  to_jsonb(aq) AS assessment_question,
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  admin_assessment_question_number (aq.id) AS number_in_alternative_group
FROM
  assessment_questions AS aq
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  aq.id = $assessment_question_id
  AND aq.question_id = $question_id
  AND a.course_instance_id = $course_instance_id
  AND aq.deleted_at IS NULL;

-- BLOCK select_assessments_for_question
SELECT
  aq.id AS assessment_question_id,
  a.id AS assessment_id,
  (aset.abbreviation || a.number) AS assessment_label,
  aset.color AS assessment_color,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name
FROM
  assessment_questions AS aq
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  aq.question_id = $question_id
  AND a.course_instance_id = $course_instance_id
  AND aq.deleted_at IS NULL
  AND a.deleted_at IS NULL
ORDER BY
  aset.number,
  a.order_by,
  a.id;

-- BLOCK select_assessment_questions_for_nav
SELECT
  aq.id,
  aq.question_id,
  q.title AS question_title,
  q.qid,
  admin_assessment_question_number (aq.id) AS question_number
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
ORDER BY
  aq.number;
