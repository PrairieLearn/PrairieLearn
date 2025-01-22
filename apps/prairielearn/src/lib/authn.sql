-- BLOCK select_user
SELECT
  to_jsonb(u.*) AS user,
  to_jsonb(i.*) AS institution,
  (adm.id IS NOT NULL) AS is_administrator
FROM
  users AS u
  LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
  JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
  u.user_id = $user_id;
