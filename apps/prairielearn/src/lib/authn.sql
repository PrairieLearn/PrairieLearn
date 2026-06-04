-- BLOCK select_user
SELECT
  to_jsonb(u.*) AS user,
  to_jsonb(i.*) AS institution,
  (adm.id IS NOT NULL) AS is_administrator
FROM
  users AS u
  LEFT JOIN administrators AS adm ON (adm.user_id = u.id)
  JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
  u.id = $user_id;

-- BLOCK select_is_institution_admin
SELECT
  EXISTS (
    SELECT
      1
    FROM
      institution_administrators
    WHERE
      user_id = $user_id
      AND institution_id = $institution_id
  );
