-- BLOCK select_course_by_id
SELECT
  *
FROM
  courses
WHERE
  id = $course_id;

-- BLOCK select_course_by_short_name
SELECT
  c.*
FROM
  courses AS c
WHERE
  c.short_name = $short_name
  AND c.deleted_at IS NULL;

-- BLOCK update_course_commit_hash
UPDATE courses
SET
  commit_hash = $commit_hash
WHERE
  id = $course_id;

-- BLOCK select_courses_with_staff_access
SELECT
  c.*,
  to_jsonb(permissions_course) AS permissions_course
FROM
  courses AS c
  JOIN authz_course ($user_id, c.id) AS permissions_course ON TRUE
WHERE
  c.deleted_at IS NULL
  -- returns a list of courses that are either example courses or are courses
  -- in which the user has a non-None course role.
  -- If the user is an administrator, return all courses.
  AND (
    (permissions_course ->> 'course_role')::enum_course_role > 'None'
    OR c.example_course IS TRUE
    OR $is_administrator IS TRUE
  )
ORDER BY
  c.short_name,
  c.title,
  c.id;

-- BLOCK select_or_insert_course_by_path
WITH
  select_course AS (
    SELECT
      c.*
    FROM
      courses AS c
    WHERE
      path = $path
    ORDER BY
      c.id DESC
    LIMIT
      1
  ),
  inserted_course AS (
    INSERT INTO
      courses AS c (
        path,
        branch,
        repository,
        display_timezone,
        institution_id
      )
    SELECT
      $path,
      $branch,
      $repository,
      i.display_timezone,
      i.id
    FROM
      institutions i
    WHERE
      i.id = 1
      AND NOT EXISTS (
        SELECT
          1
        FROM
          select_course
      )
    RETURNING
      c.*
  )
SELECT
  *
FROM
  select_course
UNION ALL
SELECT
  *
FROM
  inserted_course;

-- BLOCK delete_course
UPDATE courses AS c
SET
  deleted_at = current_timestamp
WHERE
  id = $course_id
RETURNING
  *;

-- BLOCK insert_course
INSERT INTO
  courses AS c (
    short_name,
    title,
    display_timezone,
    path,
    repository,
    branch,
    institution_id,
    show_getting_started
  )
VALUES
  (
    $short_name,
    $title,
    $display_timezone,
    $path,
    $repository,
    $branch,
    $institution_id,
    TRUE
  )
RETURNING
  *;

-- BLOCK update_course_show_getting_started
UPDATE courses
SET
  show_getting_started = $show_getting_started
WHERE
  id = $course_id;

-- BLOCK update_course_sharing_name
UPDATE courses
SET
  sharing_name = $sharing_name
WHERE
  id = $course_id;

-- BLOCK find_courses_by_sharing_names
SELECT
  *
FROM
  courses
WHERE
  sharing_name = ANY ($sharing_names::text[]);
