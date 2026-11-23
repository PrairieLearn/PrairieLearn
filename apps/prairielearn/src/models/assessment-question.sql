-- BLOCK select_assessment_question_by_id
SELECT
  *
FROM
  assessment_questions
WHERE
  id = $id;

-- BLOCK select_assessment_question_by_question_id
SELECT
  *
FROM
  assessment_questions
WHERE
  assessment_id = $assessment_id
  AND question_id = $question_id;

-- BLOCK select_preferences_for_instance_question
SELECT
  aq.preferences
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.id = $instance_question_id;

-- BLOCK select_assessment_question_by_qid
SELECT
  aq.*
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
  AND q.qid = $qid;
