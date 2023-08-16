-- BLOCK select_user_by_id
SELECT
  *
FROM
  users
WHERE
  user_id = $user_id;

-- BLOCK select_and_lock_user_by_id
SELECT
  *
FROM
  users
WHERE
  user_id = $user_id
FOR NO KEY UPDATE;
