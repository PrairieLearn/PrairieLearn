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
      user_id
    FROM
      new_users
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
SELECT
  user_id
FROM
  new_users;

-- BLOCK create_center_exam_reservation
INSERT INTO
  pt_reservations (enrollment_id, exam_id, session_id)
SELECT
  e.id,
  x.id,
  s.id
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
  e.id,
  x.id,
  s.id
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
  e.id,
  x.id,
  s.id
FROM
  pt_enrollments AS e,
  new_exams AS x,
  new_sessions AS s
WHERE
  e.user_id = $user_id
RETURNING
  *;

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
