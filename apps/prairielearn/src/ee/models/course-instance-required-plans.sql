-- BLOCK insert_required_plan_for_course_instance
INSERT INTO
  course_instance_required_plans (course_instance_id, plan_name)
VALUES
  ($course_instance_id, $plan_name)
ON CONFLICT DO NOTHING
RETURNING
  *;

-- BLOCK delete_required_plan_for_course_instance
DELETE FROM course_instance_required_plans
WHERE
  course_instance_id = $course_instance_id
  AND plan_name = $plan_name
RETURNING
  *;
