-- BLOCK select_tags
SELECT
  *
FROM
  tags
WHERE
  course_id = $course_id
ORDER BY
  number ASC NULLS LAST;

-- BLOCK insert_tags
INSERT INTO
  tags (
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
  UNNEST($tags::jsonb[]) AS t
RETURNING
  *;

-- BLOCK update_tags
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
      UNNEST($tags::jsonb[]) AS t
  )
UPDATE tags AS t
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
  AND t.name = updates.name
RETURNING
  *;

-- BLOCK delete_tags
DELETE FROM tags
WHERE
  course_id = $course_id
  AND name = ANY ($tags::text[]);

-- BLOCK sync_question_tags
WITH
  inserted_tags AS (
    INSERT INTO
      question_tags (question_id, tag_id)
    SELECT
      (question_tags_item ->> 0)::bigint,
      JSONB_ARRAY_ELEMENTS_TEXT(question_tags_item -> 1)::bigint
    FROM
      UNNEST($new_question_tags::jsonb[]) AS question_tags_item
    ON CONFLICT (question_id, tag_id) DO NOTHING
  )
DELETE FROM question_tags AS qt USING UNNEST($new_question_tags::jsonb[]) AS nqt
WHERE
  qt.question_id = (nqt ->> 0)::BIGINT
  AND qt.tag_id NOT IN (
    SELECT
      JSONB_ARRAY_ELEMENTS_TEXT(nqt -> 1)::BIGINT
  );
