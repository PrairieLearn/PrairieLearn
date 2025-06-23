-- BLOCK select_student_user
SELECT
  u.*
FROM
  users AS u
WHERE
  u.uid = 'student@example.com';

-- BLOCK select_instance_question_addVectors
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  q.qid = 'addVectors';
