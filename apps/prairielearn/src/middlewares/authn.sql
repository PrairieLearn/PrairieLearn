-- BLOCK enroll_user_in_example_course
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  ) (
    SELECT
      u.id AS user_id,
      ci.id,
      'joined',
      now()
    FROM
      users AS u,
      course_instances AS ci
      JOIN courses AS c ON (c.id = ci.course_id)
    WHERE
      u.id = $user_id
      AND c.example_course IS TRUE
      AND c.deleted_at IS NULL
      AND ci.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING
RETURNING
  *;
