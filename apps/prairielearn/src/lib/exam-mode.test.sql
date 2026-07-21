-- BLOCK setup
WITH
  new_users AS (
    INSERT INTO
      users (uid)
    VALUES
      ('user1')
    RETURNING
      *
  ),
  new_centers AS (
    INSERT INTO
      pt_centers
    DEFAULT VALUES
    RETURNING
      *
  ),
  new_locations AS (
    INSERT INTO
      pt_locations (center_id, filter_networks)
    SELECT
      id,
      TRUE
    FROM
      new_centers
    RETURNING
      *
  ),
  new_location_networks AS (
    INSERT INTO
      pt_location_networks (location_id, network)
    SELECT
      id,
      '10.0.0.0/16'
    FROM
      new_locations
    RETURNING
      *
  ),
  new_center_sessions AS (
    INSERT INTO
      pt_sessions (location_id, date)
    SELECT
      id,
      NOW()
    FROM
      new_locations
    RETURNING
      *
  ),
  new_course_sessions AS (
    INSERT INTO
      pt_sessions (date)
    VALUES
      (NOW())
    RETURNING
      *
  ),
  new_enrollments AS (
    INSERT INTO
      pt_enrollments (user_id)
    SELECT
      id
    FROM
      new_users
    RETURNING
      *
  ),
  new_courses AS (
    INSERT INTO
      pt_courses
    DEFAULT VALUES
    RETURNING
      *
  ),
  new_exams AS (
    INSERT INTO
      pt_exams (course_id)
    SELECT
      id
    FROM
      new_courses
    RETURNING
      *
  )
SELECT
  id
FROM
  new_users;

-- BLOCK create_center_exam_reservation
INSERT INTO
  pt_reservations (enrollment_id, exam_id, session_id)
SELECT
  e.id AS enrollment_id,
  x.id AS exam_id,
  s.id AS session_id
FROM
  pt_enrollments AS e,
  pt_exams AS x,
  pt_sessions AS s
WHERE
  e.user_id = $user_id
  AND s.location_id IS NOT NULL;

-- BLOCK create_course_exam_reservation
INSERT INTO
  pt_reservations (enrollment_id, exam_id, session_id)
SELECT
  e.id AS enrollment_id,
  x.id AS exam_id,
  s.id AS session_id
FROM
  pt_enrollments AS e,
  pt_exams AS x,
  pt_sessions AS s
WHERE
  e.user_id = $user_id
  AND s.location_id IS NULL;

-- BLOCK insert_second_reservation
WITH
  new_locations AS (
    INSERT INTO
      pt_locations (filter_networks)
    VALUES
      (TRUE)
    RETURNING
      *
  ),
  new_location_networks AS (
    INSERT INTO
      pt_location_networks (location_id, network)
    SELECT
      id,
      '10.1.0.0/16'
    FROM
      new_locations
  ),
  new_sessions AS (
    INSERT INTO
      pt_sessions (location_id, date)
    SELECT
      id,
      NOW()
    FROM
      new_locations
    RETURNING
      *
  ),
  new_exams AS (
    INSERT INTO
      pt_exams
    DEFAULT VALUES
    RETURNING
      *
  )
INSERT INTO
  pt_reservations (enrollment_id, exam_id, session_id)
SELECT
  e.id AS enrollment_id,
  x.id AS exam_id,
  s.id AS session_id
FROM
  pt_enrollments AS e,
  new_exams AS x,
  new_sessions AS s
WHERE
  e.user_id = $user_id
RETURNING
  *;

-- BLOCK enable_lockdown_browser_on_location
UPDATE pt_locations
SET
  lockdown_browser_enabled = TRUE;

-- BLOCK enable_lockdown_browser_on_course_session
UPDATE pt_sessions
SET
  lockdown_browser_enabled = TRUE
WHERE
  location_id IS NULL;

-- BLOCK enable_cheating_reports_on_center
UPDATE pt_centers
SET
  cheating_reports_enabled = TRUE;

-- BLOCK enable_cheating_reports_on_course
UPDATE pt_courses
SET
  cheating_reports_enabled = TRUE;

-- BLOCK check_in_reservations
UPDATE pt_reservations
SET
  -- Check in 5 minutes in the past to avoid races between PT and JS time.
  checked_in = NOW() - interval '5 minutes';

-- BLOCK start_reservations
UPDATE pt_reservations
SET
  -- Start 5 minutes in the past to avoid races between PT and JS time.
  access_start = NOW() - interval '5 minutes',
  access_end = NOW() + interval '20 minutes';
