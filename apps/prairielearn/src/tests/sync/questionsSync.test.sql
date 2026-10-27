-- BLOCK select_author_versions
SELECT
  question_id,
  uid,
  xmin::text AS transaction_id
FROM
  question_author_uids
ORDER BY
  question_id,
  uid;

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
