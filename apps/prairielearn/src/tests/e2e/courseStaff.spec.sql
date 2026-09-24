-- BLOCK select_institution_administrator_id
SELECT
  id
FROM
  institution_administrators
WHERE
  institution_id = $institution_id
  AND user_id = $user_id;
