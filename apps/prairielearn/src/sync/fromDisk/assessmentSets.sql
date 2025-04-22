-- BLOCK select_assessment_sets
SELECT
  *
FROM
  assessment_sets
WHERE
  course_id = $course_id
ORDER BY
  number ASC NULLS LAST;

-- BLOCK insert_assessment_sets
INSERT INTO
  assessment_sets (
    course_id,
    name,
    abbreviation,
    heading,
    color,
    number,
    implicit,
    json_comment
  )
SELECT
  $course_id,
  (aset ->> 0)::text,
  (aset ->> 1)::text,
  (aset ->> 2)::text,
  (aset ->> 3)::text,
  (aset ->> 4)::integer,
  (aset ->> 5)::boolean,
  (aset -> 6)
FROM
  UNNEST($sets::jsonb[]) AS aset;

-- BLOCK update_assessment_sets
WITH
  updates AS (
    SELECT
      (aset ->> 0)::text AS name,
      (aset ->> 1)::text AS abbreviation,
      (aset ->> 2)::text AS heading,
      (aset ->> 3)::text AS color,
      (aset ->> 4)::integer AS number,
      (aset ->> 5)::boolean AS implicit,
      (aset -> 6) AS json_comment
    FROM
      UNNEST($sets::jsonb[]) AS aset
  )
UPDATE assessment_sets AS aset
SET
  abbreviation = updates.abbreviation,
  heading = updates.heading,
  color = updates.color,
  number = updates.number,
  implicit = updates.implicit,
  json_comment = updates.json_comment
FROM
  updates
WHERE
  aset.course_id = $course_id
  AND aset.name = updates.name;

-- BLOCK delete_assessment_sets
DELETE FROM assessment_sets
WHERE
  course_id = $course_id
  AND name = ANY ($sets::text[]);
