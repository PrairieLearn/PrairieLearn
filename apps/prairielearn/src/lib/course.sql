-- BLOCK check_belongs
SELECT
  ai.id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.id = $assessment_instance_id
  AND a.course_instance_id = $course_instance_id;

-- BLOCK select_owners
SELECT
  u.*
FROM
  users AS u
  JOIN course_permissions AS cp ON (cp.user_id = u.id)
WHERE
  cp.course_role = 'Owner'
  AND cp.course_id = $course_id;

-- BLOCK exists_by_course_repository
SELECT
  EXISTS (
    SELECT
      1
    FROM
      courses
    WHERE
      lower(repository) = lower($repository)
      AND (
        $exclude_course_id::bigint IS NULL
        OR id <> $exclude_course_id
      )
      AND deleted_at IS NULL
  ) AS exists;

-- BLOCK exists_by_course_repository_suffix
SELECT
  EXISTS (
    SELECT
      1
    FROM
      courses
    WHERE
      (
        repository ILIKE '%/' || $suffix ESCAPE '\'
        OR repository ILIKE '%:' || $suffix ESCAPE '\'
      )
      AND (
        $exclude_course_id::bigint IS NULL
        OR id <> $exclude_course_id
      )
      AND deleted_at IS NULL
  ) AS exists;

-- BLOCK exists_by_course_path
SELECT
  EXISTS (
    SELECT
      1
    FROM
      courses
    WHERE
      path = $path
      AND (
        $exclude_course_id::bigint IS NULL
        OR id <> $exclude_course_id
      )
      AND deleted_at IS NULL
  ) AS exists;
