-- BLOCK insert_authors
INSERT INTO
  authors (author_name, email, orcid, origin_course)
SELECT
  name,
  email,
  orcid,
  "originCourse"::bigint
FROM
  jsonb_to_recordset($authors::jsonb) AS author (
    name text,
    email text,
    orcid text,
    "originCourse" text
  )
ON CONFLICT (author_name, email, orcid, origin_course) DO NOTHING;

-- BLOCK select_authors
SELECT
  a.*
FROM
  jsonb_to_recordset($authors::jsonb) AS author (
    name text,
    email text,
    orcid text,
    "originCourse" bigint
  )
  JOIN authors a ON a.author_name IS NOT DISTINCT FROM author.name
  AND a.email IS NOT DISTINCT FROM author.email
  AND a.orcid IS NOT DISTINCT FROM author.orcid
  AND a.origin_course IS NOT DISTINCT FROM author."originCourse";
