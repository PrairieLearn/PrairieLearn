-- Insert authors into the authors table
-- name: sync_authors
INSERT INTO
  authors (name, course_id)
SELECT
  unnest($author_names::text[]),
  $course_id
ON CONFLICT (name, course_id) DO NOTHING;

-- Select all authors for a course
-- name: select_authors
SELECT
  id,
  name
FROM
  authors
WHERE
  course_id = $course_id;

-- Sync question-author relationships
-- name: sync_question_authors
WITH
  new_relationships AS (
    SELECT DISTINCT
      ON (question_id, author_id) (r ->> 'question_id')::bigint as question_id,
      (r ->> 'author_id')::bigint as author_id
    FROM
      unnest($question_author_relationships::jsonb[]) AS r
  )
DELETE FROM question_authors qa
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      new_relationships nr
    WHERE
      nr.question_id = qa.question_id
      AND nr.author_id = qa.author_id
  )
  AND qa.question_id IN (
    SELECT
      question_id
    FROM
      new_relationships
  );

INSERT INTO
  question_authors (question_id, author_id)
SELECT
  question_id,
  author_id
FROM
  new_relationships
ON CONFLICT (question_id, author_id) DO NOTHING;

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
ON CONFLICT (course_id, name) DO UPDATE
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
