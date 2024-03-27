--BLOCK get_courses
SELECT
  *
FROM
  pl_courses;

--BLOCK update_course_repo
UPDATE pl_courses
SET
  repository = $repo
WHERE
  id = 1;
