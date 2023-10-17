-- BLOCK insert_required_plan_for_course_instance
WITH
  new_course_instance_required_plans AS (
    INSERT INTO
      course_instance_required_plans (course_instance_id, plan_name)
    VALUES
      ($course_instance_id, $plan_name)
    ON CONFLICT DO NOTHING
    RETURNING
      *
  )
SELECT
  new_course_instance_required_plans.*,
  c.id AS course_id,
  i.id AS institution_id
FROM
  new_course_instance_required_plans
  JOIN course_instances AS ci ON (
    ci.id = new_course_instance_required_plans.course_instance_id
  )
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id);

-- BLOCK delete_required_plan_for_course_instance
WITH
  deleted_course_instance_required_plans AS (
    DELETE FROM course_instance_required_plans
    WHERE
      course_instance_id = $course_instance_id
      AND plan_name = $plan_name
    RETURNING
      *
  )
SELECT
  deleted_course_instance_required_plans.*,
  c.id AS course_id,
  i.id AS institution_id
FROM
  deleted_course_instance_required_plans
  JOIN course_instances AS ci ON (
    ci.id = deleted_course_instance_required_plans.course_instance_id
  )
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id);
