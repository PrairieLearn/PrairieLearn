-- BLOCK enable_question_sharing
UPDATE pl_courses
SET
  question_sharing_enabled = true
WHERE
  title IN ('Test Course', 'Example Course');
