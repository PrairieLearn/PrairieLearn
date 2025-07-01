-- BLOCK select_question_by_id
SELECT
  *
FROM
  questions
WHERE
  id = $question_id;

-- BLOCK select_question_by_qid
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND qid = $qid
  AND deleted_at IS NULL;

-- BLOCK select_question_by_uuid
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND uuid = $uuid
  AND deleted_at IS NULL;

-- BLOCK select_question_by_instance_question_id
SELECT
  q.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.id = $instance_question_id;

-- BLOCK select_questions_for_course_instance_copy
SELECT DISTINCT
  q.*
FROM
  questions AS q
  JOIN assessment_questions AS aq ON (aq.question_id = q.id)
  JOIN assessments AS a ON (aq.assessment_id = a.id)
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL
  AND aq.deleted_at IS NULL;
