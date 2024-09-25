-- BLOCK update_course_repo
UPDATE pl_courses
SET
  repository = $repo
WHERE
  id = 1;

-- BLOCK select_question_by_id
SELECT
  q.*
FROM
  questions AS q
WHERE
  q.id = $id;
