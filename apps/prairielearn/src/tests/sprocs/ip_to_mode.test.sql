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
  new_locations_2 AS (
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
  new_location_networks_2 AS (
    INSERT INTO
      pt_location_networks (location_id, network)
    SELECT
      id,
      '10.1.0.0/16'
    FROM
      new_locations_2
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
  new_sessions_2 AS (
    INSERT INTO
      pt_sessions (location_id, date)
    SELECT
      id,
      NOW()
    FROM
      new_locations_2
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
      pt_exams DEFAULT
    VALUES
    RETURNING
      *
  ),
  new_reservations AS (
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
      now() - interval '1 hour',
      now() + interval '1 hour'
    FROM
      new_enrollments AS e,
      new_exams AS x,
      new_sessions AS s
    RETURNING
      *
  ),
  new_reservation_2 AS (
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
      now() - interval '1 hour',
      now() + interval '1 hour'
    FROM
      new_enrollments AS e,
      new_exams AS x,
      new_sessions_2 AS s
    RETURNING
      *
  )
SELECT
  user_id
FROM
  new_users;

-- BLOCK check_out_reservation
UPDATE pt_reservations
SET
  checked_in = NULL,
  access_start = NULL,
  access_end = NULL;
