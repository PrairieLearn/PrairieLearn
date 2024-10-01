-- BLOCK sync_authors
WITH
  new_authors AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($new_authors::JSONB) AS (author_string text)
  )
INSERT INTO
  authors (author_string)
SELECT
  author_string
FROM
  new_authors
ON CONFLICT (author_string) DO NOTHING;

-- BLOCK select_question_authors
WITH
  new_authors AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($new_authors::JSONB) AS (author_string text)
  )
SELECT INTO authors (author_string)
SELECT
  author_string
FROM
  new_authors
ON CONFLICT (author_string) DO NOTHING;

--BLOCK insert_question_authors
--BLOCK sync_course_sharing_sets
WITH
  ncss AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($new_course_sharing_sets::JSONB) AS (name text, description text)
  )
INSERT INTO
  sharing_sets (course_id, name, description)
SELECT
  $course_id,
  name,
  description
FROM
  ncss
ON CONFLICT (course_id, name) DO
UPDATE
SET
  description = EXCLUDED.description;

-- BLOCK delete_removed_authors
DELETE FROM question_authors AS qa
WHERE
  qa.question_id = (question_authors_item ->> 0)::bigint
  AND qa.author_name NOT IN (
    SELECT
      JSONB_ARRAY_ELEMENTS_TEXT(question_authors_item -> 1)::text
  );
