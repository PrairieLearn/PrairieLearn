-- BLOCK insert_course_instance
INSERT INTO
  course_instances AS dest (
    course_id,
    short_name,
    uuid,
    display_timezone,
    deleted_at
  )
SELECT
  ci.course_id,
  'UNAVAILABLE',
  '9496d805-130b-42f9-9a98-87296425e41d',
  ci.display_timezone,
  NULL
FROM
  course_instances ci
WHERE
  ci.id = 1
RETURNING
  dest.id;
