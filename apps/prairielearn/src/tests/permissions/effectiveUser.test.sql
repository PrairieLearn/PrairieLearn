-- BLOCK select_enrollment
SELECT
  e.*
FROM
  users AS u
  JOIN enrollments AS e ON e.user_id = u.user_id
  AND e.course_instance_id = $course_instance_id
WHERE
  u.user_id = $user_id;

-- BLOCK insert_administrator
INSERT INTO
  administrators (user_id)
VALUES
  ($user_id);
