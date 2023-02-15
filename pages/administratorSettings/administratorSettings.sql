-- BLOCK select
WITH
  select_config AS (
    SELECT
      coalesce(
        jsonb_agg(
          to_json(c)
          ORDER BY
            c.key
        ),
        '[]'::jsonb
      ) AS configs
    FROM
      config AS c
  )
SELECT
  configs
FROM
  select_config;

-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id;
