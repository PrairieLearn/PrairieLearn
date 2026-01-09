-- BLOCK insert_authors
INSERT INTO
  authors (author_name, email, orcid, origin_course)
SELECT
  d.name,
  d.email,
  d.orcid,
  d.origin_course::bigint
FROM
  (
    SELECT DISTINCT
      author.name,
      author.email,
      author.orcid,
      author.origin_course
    FROM
      jsonb_to_recordset($authors::jsonb) author (
        name text,
        email text,
        orcid text,
        origin_course text
      )
  ) d
  LEFT JOIN authors a ON (
    a.author_name IS NOT DISTINCT FROM d.name
    AND a.email IS NOT DISTINCT FROM d.email
    AND a.orcid IS NOT DISTINCT FROM d.orcid
    AND a.origin_course IS NOT DISTINCT FROM d.origin_course::bigint
  )
WHERE
  a.id IS NULL
ON CONFLICT DO NOTHING;

-- BLOCK select_authors
SELECT
  a.*
FROM
  jsonb_to_recordset($authors::jsonb) AS author (
    name text,
    email text,
    orcid text,
    origin_course bigint
  )
  JOIN authors a ON (
    a.author_name IS NOT DISTINCT FROM author.name
    AND a.email IS NOT DISTINCT FROM author.email
    AND a.orcid IS NOT DISTINCT FROM author.orcid
    AND a.origin_course IS NOT DISTINCT FROM author.origin_course
  );

-- BLOCK insert_question_authors
WITH
  incoming AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($1::jsonb) AS t (question_id text, author_id text)
  ),
  deleted AS (
    DELETE FROM question_authors qa
    WHERE
      qa.question_id IN (
        SELECT DISTINCT
          question_id::bigint
        FROM
          incoming
      )
      AND NOT EXISTS (
        SELECT
          1
        FROM
          incoming i
        WHERE
          i.question_id::bigint = qa.question_id
          AND i.author_id::bigint = qa.author_id
      )
    RETURNING
      1
  )
INSERT INTO
  question_authors (question_id, author_id)
SELECT
  i.question_id::bigint,
  i.author_id::bigint
FROM
  incoming i
  LEFT JOIN question_authors qa ON (
    qa.question_id = i.question_id::bigint
    AND qa.author_id = i.author_id::bigint
  )
WHERE
  qa.question_id IS NULL
  AND i.author_id IS NOT NULL
ON CONFLICT (question_id, author_id) DO NOTHING;
