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
