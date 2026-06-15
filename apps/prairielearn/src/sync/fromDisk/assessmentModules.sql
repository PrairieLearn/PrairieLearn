-- BLOCK select_assessment_modules
SELECT
  *
FROM
  assessment_modules
WHERE
  course_id = $course_id
ORDER BY
  number ASC NULLS LAST;

-- BLOCK insert_assessment_modules
INSERT INTO
  assessment_modules (course_id, name, heading, number, implicit)
SELECT
  $course_id,
  (am ->> 0)::text,
  (am ->> 1)::text,
  (am ->> 2)::integer,
  (am ->> 3)::boolean
FROM
  UNNEST($modules::jsonb[]) AS am;

-- BLOCK update_assessment_modules
WITH
  updates AS (
    SELECT
      (am ->> 0)::text AS name,
      (am ->> 1)::text AS heading,
      (am ->> 2)::integer AS number,
      (am ->> 3)::boolean AS implicit
    FROM
      UNNEST($modules::jsonb[]) AS am
  )
UPDATE assessment_modules AS am
SET
  heading = updates.heading,
  number = updates.number,
  implicit = updates.implicit
FROM
  updates
WHERE
  am.course_id = $course_id
  AND am.name = updates.name;

-- BLOCK delete_assessment_modules
DELETE FROM assessment_modules
WHERE
  course_id = $course_id
  AND name = ANY ($modules::text[]);
