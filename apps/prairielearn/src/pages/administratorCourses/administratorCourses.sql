-- BLOCK select_courses
SELECT
  to_jsonb(c.*) AS course,
  to_jsonb(i.*) AS institution
FROM
  courses AS c
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  c.deleted_at IS NULL;
