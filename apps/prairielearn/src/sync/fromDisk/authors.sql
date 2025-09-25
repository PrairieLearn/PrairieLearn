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
  LEFT JOIN authors a ON a.author_name IS NOT DISTINCT FROM d.name
  AND a.email IS NOT DISTINCT FROM d.email
  AND a.orcid IS NOT DISTINCT FROM d.orcid
  AND a.origin_course IS NOT DISTINCT FROM d.origin_course::bigint
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
