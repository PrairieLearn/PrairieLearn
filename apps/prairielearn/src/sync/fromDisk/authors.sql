-- BLOCK insert_authors
INSERT INTO
  authors (author_string)
SELECT
  (a ->> 0)::text
FROM
  UNNEST($authors::jsonb[]) AS a
ON CONFLICT (author_string) DO NOTHING;

-- BLOCK select_authors
SELECT
  *
FROM
  authors;
