-- BLOCK update_lti13_users
INSERT INTO
  lti13_users (user_id, lti13_instance_id, sub)
VALUES
  ($user_id, $lti13_instance_id, $sub)
ON CONFLICT (user_id, lti13_instance_id) DO UPDATE
SET
  sub = $sub;

-- BLOCK select_user_by_lti13_sub
SELECT
  u.*
FROM
  users AS u
  INNER JOIN lti13_users AS l13u ON u.user_id = l13u.user_id
WHERE
  l13u.lti13_instance_id = $lti13_instance_id
  AND l13u.sub = $sub;
