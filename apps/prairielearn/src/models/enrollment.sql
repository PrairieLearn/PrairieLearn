-- BLOCK insert_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id)
VALUES
  ($user_id, $course_instance_id);
