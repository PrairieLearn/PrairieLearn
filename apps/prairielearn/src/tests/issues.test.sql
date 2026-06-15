-- BLOCK select_question_id
SELECT
  id
FROM
  questions
WHERE
  course_id = 1
  AND qid = 'addNumbers';

-- BLOCK select_open_issues
SELECT
  *
FROM
  issues
WHERE
  issues.open = TRUE;
