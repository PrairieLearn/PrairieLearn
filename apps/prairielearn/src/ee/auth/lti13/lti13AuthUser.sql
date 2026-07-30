-- BLOCK candidate_uid_matches_institution
SELECT
  coalesce($candidate_uid ~ uid_regexp, FALSE)
FROM
  institutions
WHERE
  id = $institution_id;

-- BLOCK insert_user
INSERT INTO
  users (uid, name, uin, email, institution_id)
VALUES
  ($uid, $name, $uin, $email, $institution_id)
RETURNING
  *;
