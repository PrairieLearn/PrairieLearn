-- BLOCK select_admins
SELECT
  u.*
FROM
  administrators
  JOIN users AS u ON (u.user_id = administrators.user_id)
ORDER BY
  u.uid,
  u.user_id;
