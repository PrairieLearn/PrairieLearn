-- BLOCK select_admins
SELECT
  to_jsonb(u.*) AS user,
  to_jsonb(ia.*) AS institution_administrator
FROM
  institution_administrators AS ia
  JOIN users AS u ON (ia.user_id = u.user_id)
WHERE
  ia.institution_id = $institution_id
ORDER BY
  u.name,
  u.uid;
