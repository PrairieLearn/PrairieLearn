-- BLOCK select_sharing_name
SELECT
  id
FROM
  pl_courses
WHERE
  sharing_name == $origin_course;


-- BLOCK insert_authors
INSERT INTO authors (author_name, email, orcid, origin_course)
SELECT author->>'name',
       author->>'email',
       author->>'orcid',
       (author->>'originCourse')::bigint
FROM jsonb_to_recordset(to_jsonb(:authors::json)) AS author(
  name text,
  email text,
  orcid text,
  originCourse text
)
ON CONFLICT (author_name, email, orcid, origin_course) DO NOTHING;

-- BLOCK select_authors
SELECT
  *
FROM
  authors;
