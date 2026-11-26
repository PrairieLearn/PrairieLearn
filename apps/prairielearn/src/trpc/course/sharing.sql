-- BLOCK update_sharing_token
UPDATE courses
SET
  sharing_token = gen_random_uuid()
WHERE
  id = $course_id
RETURNING
  sharing_token;
