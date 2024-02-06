-- BLOCK select_break_variants_exam
SELECT
  a.id
FROM
  assessments AS a
WHERE
  tid = 'exam15-breakVariants';

-- BLOCK select_assessment_question
SELECT
  aq.id
FROM
  questions AS q
  JOIN assessment_questions AS aq ON (aq.question_id = q.id)
WHERE
  q.qid = $qid
  AND aq.assessment_id = $assessment_id;

-- BLOCK select_instance_question
SELECT
  iq.id
FROM
  instance_questions AS iq
WHERE
  iq.assessment_question_id = $assessment_question_id;
