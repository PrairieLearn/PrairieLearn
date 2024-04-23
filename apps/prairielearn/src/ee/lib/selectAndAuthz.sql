-- BLOCK select_institution_as_admin
SELECT
  to_jsonb(i.*) AS institution,
  to_jsonb(a.*) AS administrator
FROM
  institutions AS i
  LEFT JOIN administrators AS a ON (a.user_id = $user_id)
WHERE
  i.id = $institution_id;
