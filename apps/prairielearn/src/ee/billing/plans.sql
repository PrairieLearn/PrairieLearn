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

-- BLOCK select_plan_grants_for_course_instance
SELECT
  pg.plan_name
FROM
  plan_grants AS pg
  JOIN course_instances AS ci ON (ci.id = pg.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  ci.id = $course_instance_id;

-- BLOCK select_required_plans_for_course_instance
SELECT
  plan_name
FROM
  course_instance_required_plans
WHERE
  course_instance_id = $course_instance_id;

-- BLOCK update_required_plans_for_course_instance
WITH
  deleted_required_plans AS (
    DELETE FROM course_instance_required_plans
    WHERE
      course_instance_id = $course_instance_id
      AND plan_name NOT IN (
        SELECT
          UNNEST($plans::text[])
      )
  )
INSERT INTO
  course_instance_required_plans (course_instance_id, plan_name)
SELECT
  $course_instance_id,
  UNNEST($plans::text[])
ON CONFLICT DO NOTHING;
