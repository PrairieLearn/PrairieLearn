-- BLOCK enroll_student_in_course
INSERT INTO
  enrollments (course_instance_id, user_id)
SELECT
  ci.id,
  u.user_id
FROM
  course_instances AS ci,
  users AS u
WHERE
  u.uid ~ 'student';

-- BLOCK select_exam9
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'E'
  AND a.number = '9';

-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;
