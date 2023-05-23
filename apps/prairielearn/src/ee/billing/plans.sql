-- BLOCK select_plan_grants_for_institution
SELECT
  plan_name
FROM
  plan_grants
WHERE
  institution_id = $institution_id
  AND course_instance_id IS NULL
  AND user_id IS NULL
  and enrollment_id IS NULL;

-- BLOCK select_required_plans_for_course_instance
SELECT
  plan_name
FROM
  course_instance_required_plans
WHERE
  course_instance_id = $course_instance_id;
