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

-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;
