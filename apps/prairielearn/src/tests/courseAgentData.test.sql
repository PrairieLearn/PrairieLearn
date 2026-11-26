-- BLOCK insert_administrator
INSERT INTO
  administrators (user_id)
VALUES
  ($user_id);

-- BLOCK insert_sharing_set
INSERT INTO
  sharing_sets (course_id, name, description)
VALUES
  ($course_id, $name, 'Questions for tests')
RETURNING
  id;

-- BLOCK insert_sharing_set_course
INSERT INTO
  sharing_set_courses (sharing_set_id, course_id)
VALUES
  ($sharing_set_id, $course_id);
