-- BLOCK select_plan_grants_for_institution
SELECT
  *
FROM
  plan_grants
WHERE
  institution_id = $institution_id
  AND course_instance_id IS NULL
  AND user_id IS NULL
  and enrollment_id IS NULL;

-- BLOCK select_plan_grants_for_course_instance
SELECT
  pg.*
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

-- BLOCK update_plan_grants_for_institution
WITH
  desired_plan_grants AS (
    SELECT
      (plans ->> 'plan')::text AS plan_name,
      (plans ->> 'grantType')::text AS grant_type
    FROM
      JSON_ARRAY_ELEMENTS($plans::json) AS plans
  ),
  deleted_plan_grants AS (
    DELETE FROM plan_grants
    WHERE
      institution_id = $institution_id
      AND NOT EXISTS (
        SELECT
          *
        FROM
          desired_plan_grants
        WHERE
          plan_name = plan_grants.plan_name
      )
  )
INSERT INTO
  plan_grants (
    institution_id,
    plan_name,
    type
  )
SELECT
  $institution_id,
  plan_name,
  grant_type::enum_plan_grant_type
FROM
  desired_plan_grants
ON CONFLICT (
  plan_name,
  institution_id,
  course_instance_id,
  enrollment_id
) DO
UPDATE
SET
type = EXCLUDED.type;

-- BLOCK update_plan_grants_for_course_instance
WITH
  desired_plan_grants AS (
    SELECT
      (plans ->> 'plan')::text AS plan_name,
      (plans ->> 'grantType')::text AS grant_type
    FROM
      JSON_ARRAY_ELEMENTS($plans::json) AS plans
  ),
  deleted_plan_grants AS (
    DELETE FROM plan_grants
    WHERE
      course_instance_id = $course_instance_id
      AND NOT EXISTS (
        SELECT
          *
        FROM
          desired_plan_grants
        WHERE
          plan_name = plan_grants.plan_name
      )
  )
INSERT INTO
  plan_grants (
    institution_id,
    course_instance_id,
    plan_name,
    type
  )
SELECT
  i.id,
  $course_instance_id,
  plan_name,
  grant_type::enum_plan_grant_type
FROM
  desired_plan_grants
  JOIN course_instances AS ci ON (ci.id = $course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
ON CONFLICT (
  plan_name,
  institution_id,
  course_instance_id,
  enrollment_id
) DO
UPDATE
SET
type = EXCLUDED.type;
