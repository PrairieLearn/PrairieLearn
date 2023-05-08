SELECT
  c.short_name,
  c.title,
  c.id
FROM
  pl_courses as c
WHERE
  NOT EXISTS (
    SELECT
      *
    FROM
      chunks AS ch
    WHERE
      ch.course_id = c.id
  )
  AND c.deleted_at IS NULL
ORDER BY
  short_name DESC;
