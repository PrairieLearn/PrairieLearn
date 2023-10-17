-- BLOCK get_test_course
SELECT
  assessments_group_by,
  id
FROM
  course_instances
WHERE
  short_name = 'Fa19';
