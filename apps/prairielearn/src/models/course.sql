-- BLOCK select_course_by_id
SELECT
  *
FROM
  pl_courses
where
  id = $course_id;

-- BLOCK update_course_commit_hash
UPDATE pl_courses
SET
  commit_hash = $commit_hash
WHERE
  id = $course_id;

-- BLOCK select_courses_with_staff_access
SELECT
  c.*,
  to_jsonb(permissions_course) AS permissions_course
FROM
  pl_courses AS c
  JOIN authz_course ($user_id, c.id, $is_administrator, TRUE) AS permissions_course ON TRUE
WHERE
  c.deleted_at IS NULL
  -- returns a list of courses that are either example courses or are courses
  -- in which the user has a non-None course role
  AND (
    (permissions_course ->> 'course_role')::enum_course_role > 'None'
    OR c.example_course IS TRUE
  )
ORDER BY
  c.short_name,
  c.title,
  c.id;
