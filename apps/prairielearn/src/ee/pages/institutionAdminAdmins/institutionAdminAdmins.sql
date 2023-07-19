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

-- BLOCK insert_institution_admin
INSERT INTO
  institution_administrators (institution_id, user_id)
VALUES
  ($institution_id, $user_id)
RETURNING
  *;

-- BLOCK delete_institution_admin
DELETE FROM institution_administrators
WHERE
  institution_id = $institution_id
  AND id = $institution_administrator_id;
