-- BLOCK select_student_user
SELECT
  u.*
FROM
  users AS u
WHERE
  u.uid = 'student@illinois.edu';

-- BLOCK select_e1
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'E'
  AND a.number = '1';

-- BLOCK select_instance_question_addVectors
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  q.qid = 'addVectors';
