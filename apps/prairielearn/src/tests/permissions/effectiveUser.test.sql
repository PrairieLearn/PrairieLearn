-- BLOCK select_enrollment
SELECT
  e.*
FROM
  users AS u
  JOIN enrollments AS e ON e.user_id = u.id
  AND e.course_instance_id = $course_instance_id
WHERE
  u.id = $user_id;

-- BLOCK insert_administrator
INSERT INTO
  administrators (user_id)
VALUES
  ($user_id);

-- BLOCK create_active_lockdown_browser_reservation
WITH
  new_pt_enrollment AS (
    INSERT INTO
      pt_enrollments (user_id)
    VALUES
      ($user_id)
    RETURNING
      id
  ),
  new_pt_exam AS (
    INSERT INTO
      pt_exams (name)
    VALUES
      ('effective-user-lockdown-browser-test')
    RETURNING
      id
  ),
  new_pt_session AS (
    INSERT INTO
      pt_sessions (date, lockdown_browser_enabled)
    VALUES
      (NOW(), TRUE)
    RETURNING
      id
  )
INSERT INTO
  pt_reservations (enrollment_id, exam_id, session_id, checked_in)
SELECT
  new_pt_enrollment.id AS enrollment_id,
  new_pt_exam.id AS exam_id,
  new_pt_session.id AS session_id,
  NOW() - interval '5 minutes'
FROM
  new_pt_enrollment,
  new_pt_exam,
  new_pt_session;

-- BLOCK delete_lockdown_browser_reservation
WITH
  test_reservations AS (
    SELECT
      r.id,
      r.enrollment_id,
      r.exam_id,
      r.session_id
    FROM
      pt_reservations AS r
      JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
      JOIN pt_exams AS x ON (x.id = r.exam_id)
    WHERE
      e.user_id = $user_id
      AND x.name = 'effective-user-lockdown-browser-test'
  ),
  deleted_reservations AS (
    DELETE FROM pt_reservations
    WHERE
      id IN (
        SELECT
          id
        FROM
          test_reservations
      )
  ),
  deleted_sessions AS (
    DELETE FROM pt_sessions
    WHERE
      id IN (
        SELECT
          session_id
        FROM
          test_reservations
      )
  ),
  deleted_exams AS (
    DELETE FROM pt_exams
    WHERE
      id IN (
        SELECT
          exam_id
        FROM
          test_reservations
      )
  )
DELETE FROM pt_enrollments
WHERE
  id IN (
    SELECT
      enrollment_id
    FROM
      test_reservations
  );
