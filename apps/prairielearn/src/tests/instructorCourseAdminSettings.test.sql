--BLOCK select_test_course_id
SELECT
  c.id
FROM
  pl_courses as c
WHERE
  short_name = 'TEST 101';

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
