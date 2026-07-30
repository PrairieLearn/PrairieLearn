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
  consuming_course.sharing_token = $course_sharing_token
  AND ss.id = $sharing_set_id
  AND sharing_course.id = $sharing_course_id
  -- A no-op UPDATE is required (not `DO NOTHING`) so that RETURNING fires on
  -- both insert and conflict. Callers rely on the returned row to confirm the
  -- consuming course was found and belongs to this sharing course; switching
  -- to `DO NOTHING` would silently return zero rows on the idempotent path
  -- and break that check.
ON CONFLICT (sharing_set_id, course_id) DO UPDATE
SET
  course_id = EXCLUDED.course_id
RETURNING
  course_id;
