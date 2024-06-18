-- BLOCK select_institution_as_admin
SELECT
  to_jsonb(i.*) AS institution,
  to_jsonb(a.*) AS administrator,
  to_jsonb(ia.*) AS institution_administrator
FROM
  institutions AS i
  LEFT JOIN administrators AS a ON (a.user_id = $user_id)
  LEFT JOIN institution_administrators AS ia ON (
    ia.institution_id = i.id
    AND ia.user_id = $user_id
  )
WHERE
  i.id = $institution_id;
