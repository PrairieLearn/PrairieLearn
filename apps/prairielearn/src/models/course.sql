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

-- BLOCK select_course_by_repository_name
SELECT
  c.*
FROM
  courses AS c
WHERE
  (
    c.repository ILIKE '%/' || $repo_name || '.git' ESCAPE '\'
    OR c.repository ILIKE '%:' || $repo_name || '.git' ESCAPE '\'
  )
  AND c.deleted_at IS NULL
LIMIT
  1;

-- BLOCK select_course_by_path
SELECT
  c.*
FROM
  courses AS c
WHERE
  c.path = $path
  AND c.deleted_at IS NULL
LIMIT
  1;

-- BLOCK update_course_commit_hash
UPDATE courses
SET
  commit_hash = $commit_hash
WHERE
  id = $course_id;

-- BLOCK select_all_courses
SELECT
  c.*
FROM
  courses AS c
WHERE
  c.deleted_at IS NULL
ORDER BY
  c.short_name,
  c.title,
  c.id;

-- BLOCK select_courses_with_staff_access
WITH
  courses_with_permissions AS (
    (
      -- Courses where the user itself is part of staff with a non-None role
      SELECT
        cp.course_id,
        cp.course_role
      FROM
        course_permissions AS cp
      WHERE
        cp.user_id = $user_id
        AND cp.course_role > 'None'
    )
    UNION ALL
    (
      -- If the user is an institution administrator, they get Owner access to all courses in the institution
      SELECT
        c.id AS course_id,
        'Owner'::enum_course_role AS course_role
      FROM
        institution_administrators AS ia
        JOIN courses AS c ON (c.institution_id = ia.institution_id)
      WHERE
        ia.user_id = $user_id
        AND c.deleted_at IS NULL
    )
    UNION ALL
    (
      -- All users have access to the example course with at least the Viewer role
      SELECT
        c.id AS course_id,
        'Viewer'::enum_course_role AS course_role
      FROM
        courses AS c
      WHERE
        c.example_course IS TRUE
    )
  ),
  highest_role AS (
    -- In case of multiple permissions for the same course, take the highest role
    SELECT
      course_id,
      MAX(course_role::enum_course_role) AS course_role
    FROM
      courses_with_permissions
    GROUP BY
      course_id
  )
SELECT
  to_jsonb(c.*) AS course,
  hr.course_role
FROM
  highest_role AS hr
  JOIN courses AS c ON (c.id = hr.course_id)
WHERE
  c.deleted_at IS NULL
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
  AND deleted_at IS NULL
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

-- BLOCK update_course_column_short_name
UPDATE courses
SET
  short_name = $value
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_course_column_title
UPDATE courses
SET
  title = $value
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_course_column_display_timezone
UPDATE courses
SET
  display_timezone = $value
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_course_column_path
UPDATE courses
SET
  path = $value
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_course_column_repository
UPDATE courses
SET
  repository = $value
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_course_column_branch
UPDATE courses
SET
  branch = $value
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK update_course_column_institution_id
UPDATE courses
SET
  institution_id = $value::bigint
WHERE
  id = $course_id
  AND deleted_at IS NULL
RETURNING
  *;

-- BLOCK find_courses_by_sharing_names
SELECT
  *
FROM
  courses
WHERE
  sharing_name = ANY ($sharing_names::text[]);
