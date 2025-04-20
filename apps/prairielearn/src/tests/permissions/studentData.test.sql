-- BLOCK select_exam1
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'E'
  AND a.number = '1';

-- BLOCK select_homework1
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.number = '1';

-- BLOCK select_instance_question
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  AND (q.qid = $qid)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  AND (ai.assessment_id = $assessment_id);

-- BLOCK select_variant
SELECT
  v.*
FROM
  variants AS v
  JOIN instance_questions AS iq ON iq.id = v.instance_question_id
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  AND ai.assessment_id = $assessment_id;
