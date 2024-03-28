-- BLOCK clear
WITH
  deleted_reservations AS (
    DELETE FROM pt_reservations
    RETURNING
      *
  ),
  deleted_exams AS (
    DELETE FROM pt_exams
    RETURNING
      *
  ),
  deleted_enrollments AS (
    DELETE FROM pt_enrollments
    RETURNING
      *
  ),
  deleted_sessions AS (
    DELETE FROM pt_sessions
    RETURNING
      *
  ),
  deleted_location_networks AS (
    DELETE FROM pt_location_networks
    RETURNING
      *
  ),
  deleted_locations AS (
    DELETE FROM pt_locations
  ),
  deleted_users AS (
    DELETE FROM users
    RETURNING
      *
  )
SELECT
  1;

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
  new_sessions AS (
    INSERT INTO
      pt_sessions (location_id)
    SELECT
      id
    FROM
      new_locations
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
  )
SELECT
  user_id
FROM
  new_users;
