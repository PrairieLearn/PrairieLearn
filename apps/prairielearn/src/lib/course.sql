-- BLOCK check_belongs
SELECT
  ai.id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.id = $assessment_instance_id
  AND a.course_instance_id = $course_instance_id;

-- BLOCK select_owners
SELECT
  u.*
FROM
  users AS u
  JOIN course_permissions AS cp ON (cp.user_id = u.user_id)
WHERE
  cp.course_role = 'Owner'
  AND cp.course_id = $course_id;
