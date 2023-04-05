-- BLOCK enroll_user_in_example_course
INSERT INTO
  enrollments (user_id, course_instance_id) (
    SELECT
      u.user_id,
      ci.id
    FROM
      users AS u,
      course_instances AS ci
      JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
      u.user_id = $user_id
      AND c.example_course IS TRUE
  )
ON CONFLICT DO NOTHING;
