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

-- BLOCK select_exam11
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'E'
  AND a.number = '11';

-- BLOCK select_homework8
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.number = '8';

-- BLOCK read_assessment_instance_points
SELECT
  ai.points
FROM
  assessment_instances AS ai
WHERE
  ai.assessment_id = $assessment_id;

-- BLOCK get_attached_files
SELECT
  *
FROM
  files
WHERE
  files.assessment_id = $assessment_id;

-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;
