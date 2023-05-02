-- BLOCK select_permissions
SELECT
  u.uid,
  cp.course_role,
  cip.course_instance_role
FROM
  users AS u
  JOIN course_permissions AS cp ON cp.user_id = u.user_id
  AND cp.course_id = $course_id
  LEFT JOIN course_instance_permissions AS cip ON cip.course_permission_id = cp.id
  AND cip.course_instance_id = $course_instance_id;

-- BLOCK select_non_existent_user
SELECT
  'newstaff' || s || '@illinois.edu' AS uid
FROM
  generate_series(1, 10000) AS s
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      users AS u
    WHERE
      u.uid = 'newstaff' || s || '@illinois.edu'
  )
LIMIT
  1
