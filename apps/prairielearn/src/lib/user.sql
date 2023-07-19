-- BLOCK select_user_by_uid
SELECT
  *
FROM
  users
WHERE
  uid = $uid;
