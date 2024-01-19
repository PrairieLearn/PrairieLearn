-- BLOCK select
WITH
  select_courses AS (
    SELECT
      coalesce(
        jsonb_agg(
          jsonb_set(to_jsonb(c), '{institution}', to_jsonb(i))
          ORDER BY
            i.short_name,
            c.short_name,
            c.title,
            c.id
        ),
        '[]'::jsonb
      ) AS courses
    FROM
      pl_courses AS c
      JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
      c.deleted_at IS NULL
  )
SELECT
  courses
FROM
  select_courses;

-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id;
