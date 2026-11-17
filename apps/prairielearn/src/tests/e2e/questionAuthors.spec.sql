-- BLOCK set_authors_unknown
UPDATE questions
SET
  authors = NULL
WHERE
  id = $question_id;
