-- BLOCK select_user_by_id
SELECT
  *
FROM
  users
WHERE
  user_id = $user_id;
