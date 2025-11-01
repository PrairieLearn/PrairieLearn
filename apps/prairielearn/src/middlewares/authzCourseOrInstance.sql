-- BLOCK select_user
SELECT
  to_jsonb(u) AS user,
  to_jsonb(i) AS institution,
  (adm.id IS NOT NULL) AS is_administrator,
  users_is_instructor_in_course_instance (u.user_id, $course_instance_id) AS is_instructor
FROM
  users AS u
  LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
  JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
  u.uid = $uid;
