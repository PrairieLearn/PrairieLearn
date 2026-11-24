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

-- BLOCK clear_issue_user
UPDATE issues
SET
  user_id = NULL
WHERE
  variant_id = $variant_id
  AND student_message = $student_message;
