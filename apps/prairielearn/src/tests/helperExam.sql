-- BLOCK select_assessment_instances
SELECT
  ai.*
FROM
  assessment_instances AS ai;

-- BLOCK select_instance_questions
SELECT
  iq.*,
  q.qid
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
ORDER BY
  q.qid;

-- BLOCK create_pt_reservation
WITH
  created_exam AS (
    INSERT INTO
      pt_exams (uuid)
    VALUES
      -- This matches the value of examUuid in exam1-automaticTestSuite/infoAssessment.json
      ('e66122b5-c793-4235-9851-9a3aa80ae39b')
    RETURNING
      *
  ),
  created_session AS (
    INSERT INTO
      pt_sessions (date)
    VALUES
      ($access_start)
    RETURNING
      *
  ),
  created_enrollment AS (
    INSERT INTO
      pt_enrollments (user_id)
    VALUES
      ($user_id)
    RETURNING
      *
  )
INSERT INTO
  pt_reservations (
    access_start,
    access_end,
    enrollment_id,
    exam_id,
    session_id
  )
SELECT
  $access_start,
  $access_end,
  e.id AS enrollment_id,
  x.id AS exam_id,
  s.id AS session_id
FROM
  created_enrollment AS e,
  created_exam AS x,
  created_session AS s;

-- BLOCK delete_pt_reservation
WITH
  deleted_exam AS (
    DELETE FROM pt_exams
  ),
  deleted_session AS (
    DELETE FROM pt_sessions
  ),
  deleted_enrollment AS (
    DELETE FROM pt_enrollments
  )
DELETE FROM pt_reservations;
