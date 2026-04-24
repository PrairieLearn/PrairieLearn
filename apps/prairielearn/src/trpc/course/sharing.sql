-- BLOCK update_sharing_token
UPDATE courses
SET
  sharing_token = gen_random_uuid()
WHERE
  id = $course_id
RETURNING
  sharing_token;

-- BLOCK course_sharing_set_add
INSERT INTO
  sharing_set_courses (course_id, sharing_set_id)
SELECT
  consuming_course.id AS course_id,
  ss.id AS sharing_set_id
FROM
  courses AS sharing_course
  JOIN sharing_sets AS ss ON ss.course_id = sharing_course.id
  JOIN courses AS consuming_course ON consuming_course.id <> sharing_course.id
WHERE
  consuming_course.sharing_token = $unsafe_course_sharing_token
  AND ss.id = $unsafe_sharing_set_id
  AND sharing_course.id = $sharing_course_id
ON CONFLICT (sharing_set_id, course_id) DO UPDATE
SET
  course_id = EXCLUDED.course_id
RETURNING
  course_id;
