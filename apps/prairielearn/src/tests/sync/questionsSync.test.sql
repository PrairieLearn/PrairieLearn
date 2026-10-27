-- BLOCK insert_legacy_author
WITH
  author AS (
    INSERT INTO
      authors (email)
    VALUES
      ('legacy-uid')
    RETURNING
      id
  )
INSERT INTO
  question_authors (question_id, author_id)
SELECT
  $question_id,
  id
FROM
  author;
