-- BLOCK select_topics
SELECT
  *
FROM
  topics
WHERE
  course_id = $course_id
ORDER BY
  number ASC NULLS LAST;

-- BLOCK insert_topics
INSERT INTO
  topics (
    course_id,
    name,
    description,
    color,
    number,
    implicit,
    json_comment
  )
SELECT
  $course_id,
  (t ->> 0)::text,
  COALESCE((t ->> 1)::text, ''),
  (t ->> 2)::text,
  (t ->> 3)::integer,
  (t ->> 4)::boolean,
  (t -> 5)
FROM
  UNNEST($topics::jsonb[]) AS t;

-- BLOCK update_topics
WITH
  updates AS (
    SELECT
      (t ->> 0)::text AS name,
      (t ->> 1)::text AS description,
      (t ->> 2)::text AS color,
      (t ->> 3)::integer AS number,
      (t ->> 4)::boolean AS implicit,
      (t -> 5) AS json_comment
    FROM
      UNNEST($topics::jsonb[]) AS t
  )
UPDATE topics AS t
SET
  description = COALESCE(updates.description, ''),
  color = updates.color,
  number = updates.number,
  implicit = updates.implicit,
  json_comment = updates.json_comment
FROM
  updates
WHERE
  t.course_id = $course_id
  AND t.name = updates.name;

-- BLOCK delete_topics
DELETE FROM topics
WHERE
  course_id = $course_id
  AND name = ANY ($topics::text[]);
