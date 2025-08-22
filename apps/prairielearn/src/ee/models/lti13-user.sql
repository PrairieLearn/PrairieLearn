-- BLOCK update_lti13_users
INSERT INTO
  lti13_users (user_id, lti13_instance_id, sub)
VALUES
  ($user_id, $lti13_instance_id, $sub)
ON CONFLICT (user_id, lti13_instance_id) DO UPDATE
SET
  sub = $sub;

-- BLOCK select_lti13_instance_identities_for_course_instance
SELECT DISTINCT
  ON (lti13_instances.id) to_jsonb(lti13_instances.*) AS lti13_instance,
  lti13_users.id AS lti13_user_id
FROM
  lti13_course_instances
  JOIN lti13_instances ON (
    lti13_course_instances.lti13_instance_id = lti13_instances.id
  )
  LEFT JOIN lti13_users ON (
    lti13_instances.id = lti13_users.lti13_instance_id
    AND lti13_users.user_id = $user_id
  )
WHERE
  lti13_course_instances.course_instance_id = $course_instance_id;

-- BLOCK select_user_by_lti13_sub
SELECT
  u.*
FROM
  users AS u
  INNER JOIN lti13_users AS l13u ON u.user_id = l13u.user_id
WHERE
  l13u.lti13_instance_id = $lti13_instance_id
  AND l13u.sub = $sub;
