-- BLOCK grant_dev_user_owner_on_all_courses
INSERT INTO
  course_permissions (user_id, course_id, course_role)
SELECT
  u.id AS user_id,
  c.id AS course_id,
  'Owner'
FROM
  users AS u,
  courses AS c
WHERE
  u.uid = 'dev@example.com'
ON CONFLICT (user_id, course_id) DO NOTHING;
