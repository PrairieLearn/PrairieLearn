-- BLOCK create_active_reservation
WITH
  created_course AS (
    INSERT INTO
      pt_courses (name, cheating_reports_enabled)
    VALUES
      ('Report cheating E2E course', TRUE)
    RETURNING
      id
  ),
  created_exam AS (
    INSERT INTO
      pt_exams (uuid, course_id)
    SELECT
      $exam_uuid,
      id
    FROM
      created_course
    RETURNING
      id
  ),
  created_session AS (
    INSERT INTO
      pt_sessions (date, lockdown_browser_enabled)
    VALUES
      (NOW(), FALSE)
    RETURNING
      id
  ),
  created_enrollment AS (
    INSERT INTO
      pt_enrollments (user_id)
    VALUES
      ($user_id)
    RETURNING
      id
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
  NOW() - INTERVAL '1 minute',
  NOW() + INTERVAL '1 hour',
  enrollment.id,
  exam.id,
  session.id
FROM
  created_enrollment AS enrollment,
  created_exam AS exam,
  created_session AS session
RETURNING
  id;

-- BLOCK delete_reservation
WITH
  deleted_reservation AS (
    DELETE FROM pt_reservations
    WHERE
      id = $reservation_id
    RETURNING
      enrollment_id,
      exam_id,
      session_id
  ),
  deleted_enrollment AS (
    DELETE FROM pt_enrollments
    WHERE
      id IN (
        SELECT
          enrollment_id
        FROM
          deleted_reservation
      )
  ),
  deleted_session AS (
    DELETE FROM pt_sessions
    WHERE
      id IN (
        SELECT
          session_id
        FROM
          deleted_reservation
      )
  ),
  deleted_exam AS (
    DELETE FROM pt_exams
    WHERE
      id IN (
        SELECT
          exam_id
        FROM
          deleted_reservation
      )
    RETURNING
      course_id
  )
DELETE FROM pt_courses
WHERE
  id IN (
    SELECT
      course_id
    FROM
      deleted_exam
  );
