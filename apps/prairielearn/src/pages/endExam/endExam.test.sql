-- BLOCK setup_user
-- One user + one enrollment shared across the suite. Each test creates
-- its own reservations inside a rolled-back transaction so they don't
-- contaminate the rest.
WITH
  new_user AS (
    INSERT INTO
      users (uid)
    VALUES
      ('endexam-test-user')
    RETURNING
      *
  ),
  new_enrollment AS (
    INSERT INTO
      pt_enrollments (user_id)
    SELECT
      id
    FROM
      new_user
    RETURNING
      *
  )
SELECT
  id
FROM
  new_user;

-- BLOCK create_active_ldb_center_reservation
-- LDB-enabled center reservation whose access window currently contains
-- now(). $hours_until_end controls the access_end offset so callers can
-- order overlapping windows.
WITH
  new_location AS (
    INSERT INTO
      pt_locations (filter_networks, lockdown_browser_enabled)
    VALUES
      (FALSE, TRUE)
    RETURNING
      *
  ),
  new_session AS (
    INSERT INTO
      pt_sessions (location_id, date)
    SELECT
      id,
      NOW()
    FROM
      new_location
    RETURNING
      *
  ),
  new_exam AS (
    INSERT INTO
      pt_exams
    DEFAULT VALUES
    RETURNING
      *
  )
INSERT INTO
  pt_reservations (
    enrollment_id,
    exam_id,
    session_id,
    access_start,
    access_end
  )
SELECT
  e.id,
  x.id,
  s.id,
  NOW() - interval '5 minutes',
  NOW() + ($hours_until_end || ' hour')::interval
FROM
  pt_enrollments AS e,
  new_exam AS x,
  new_session AS s
WHERE
  e.user_id = $user_id
RETURNING
  id;

-- BLOCK create_active_ldb_course_reservation
-- Course-run session (no location); LDB flag lives on pt_sessions.
WITH
  new_session AS (
    INSERT INTO
      pt_sessions (date, lockdown_browser_enabled)
    VALUES
      (NOW(), TRUE)
    RETURNING
      *
  ),
  new_exam AS (
    INSERT INTO
      pt_exams
    DEFAULT VALUES
    RETURNING
      *
  )
INSERT INTO
  pt_reservations (
    enrollment_id,
    exam_id,
    session_id,
    access_start,
    access_end
  )
SELECT
  e.id,
  x.id,
  s.id,
  NOW() - interval '5 minutes',
  NOW() + interval '1 hour'
FROM
  pt_enrollments AS e,
  new_exam AS x,
  new_session AS s
WHERE
  e.user_id = $user_id
RETURNING
  id;

-- BLOCK create_active_non_ldb_reservation
-- Active reservation; neither location nor session has LDB enabled.
WITH
  new_location AS (
    INSERT INTO
      pt_locations (filter_networks, lockdown_browser_enabled)
    VALUES
      (FALSE, FALSE)
    RETURNING
      *
  ),
  new_session AS (
    INSERT INTO
      pt_sessions (location_id, date, lockdown_browser_enabled)
    SELECT
      id,
      NOW(),
      FALSE
    FROM
      new_location
    RETURNING
      *
  ),
  new_exam AS (
    INSERT INTO
      pt_exams
    DEFAULT VALUES
    RETURNING
      *
  )
INSERT INTO
  pt_reservations (
    enrollment_id,
    exam_id,
    session_id,
    access_start,
    access_end
  )
SELECT
  e.id,
  x.id,
  s.id,
  NOW() - interval '5 minutes',
  NOW() + interval '1 hour'
FROM
  pt_enrollments AS e,
  new_exam AS x,
  new_session AS s
WHERE
  e.user_id = $user_id;

-- BLOCK create_expired_ldb_reservation
-- LDB-enabled, but the access window ended an hour ago.
WITH
  new_location AS (
    INSERT INTO
      pt_locations (filter_networks, lockdown_browser_enabled)
    VALUES
      (FALSE, TRUE)
    RETURNING
      *
  ),
  new_session AS (
    INSERT INTO
      pt_sessions (location_id, date)
    SELECT
      id,
      NOW() - interval '2 hours'
    FROM
      new_location
    RETURNING
      *
  ),
  new_exam AS (
    INSERT INTO
      pt_exams
    DEFAULT VALUES
    RETURNING
      *
  )
INSERT INTO
  pt_reservations (
    enrollment_id,
    exam_id,
    session_id,
    access_start,
    access_end
  )
SELECT
  e.id,
  x.id,
  s.id,
  NOW() - interval '2 hours',
  NOW() - interval '1 hour'
FROM
  pt_enrollments AS e,
  new_exam AS x,
  new_session AS s
WHERE
  e.user_id = $user_id;
