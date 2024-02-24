-- BLOCK select_courses
SELECT
  c.*,
  to_jsonb(i.*) AS institution
FROM
  pl_courses AS c
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  c.deleted_at IS NULL;

-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id;
