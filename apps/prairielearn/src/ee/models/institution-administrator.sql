-- BLOCK ensure_institution_admin
INSERT INTO
  institution_administrators (institution_id, user_id)
VALUES
  ($institution_id, $user_id)
ON CONFLICT DO NOTHING
RETURNING
  *;

-- BLOCK delete_institution_admin
DELETE FROM institution_administrators
WHERE
  institution_id = $institution_id
  AND id = $unsafe_institution_administrator_id
RETURNING
  *;
