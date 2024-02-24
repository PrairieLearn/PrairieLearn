-- BLOCK select_user_by_id
SELECT
  *
FROM
  users
WHERE
  user_id = $user_id;

-- BLOCK select_user_by_uid
SELECT
  *
FROM
  users
WHERE
  uid = $uid;

-- BLOCK select_and_lock_user_by_id
SELECT
  *
FROM
  users
WHERE
  user_id = $user_id
FOR NO KEY UPDATE;

-- BLOCK select_or_insert_user_by_uid
WITH
  existing_user AS (
    SELECT
      *
    FROM
      users
    WHERE
      uid = $uid
  ),
  inserted_user AS (
    INSERT INTO
      users (uid)
    SELECT
      $uid
    WHERE
      NOT EXISTS (
        SELECT
          1
        FROM
          existing_user
      )
    RETURNING
      *
  )
SELECT
  *
FROM
  existing_user
UNION ALL
SELECT
  *
FROM
  inserted_user;
