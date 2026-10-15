-- BLOCK insert_course
INSERT INTO
  courses (id, path, display_timezone, uuid, deleted_at)
VALUES
  (
    $id::bigint,
    '/uuid-backfill/' || $id::text,
    'UTC',
    $uuid::uuid,
    CASE
      WHEN $deleted::boolean THEN NOW()
      ELSE NULL
    END
  );

-- BLOCK select_courses
SELECT
  *
FROM
  courses
ORDER BY
  id;
