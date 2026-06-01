-- BLOCK setup_user
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

-- BLOCK insert_location
INSERT INTO
  pt_locations (filter_networks, lockdown_browser_enabled)
VALUES
  (FALSE, $lockdown_browser_enabled)
RETURNING
  id;

-- BLOCK insert_session
INSERT INTO
  pt_sessions (location_id, date, lockdown_browser_enabled)
VALUES
  ($location_id, NOW(), $lockdown_browser_enabled)
RETURNING
  id;

-- BLOCK insert_reservation
WITH
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
  e.id AS enrollment_id,
  x.id AS exam_id,
  $session_id,
  $access_start,
  $access_end
FROM
  pt_enrollments AS e,
  new_exam AS x
WHERE
  e.user_id = $user_id
RETURNING
  id;
