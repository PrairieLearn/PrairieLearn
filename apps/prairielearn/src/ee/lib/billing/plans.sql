-- BLOCK select_plan_grants_for_context
SELECT
  pg.*
FROM
  plan_grants AS pg
WHERE
  institution_id IS NOT DISTINCT FROM $institution_id
  AND course_instance_id IS NOT DISTINCT FROM $course_instance_id
  AND user_id IS NOT DISTINCT FROM $user_id;

-- BLOCK select_plan_grants_for_partial_contexts
SELECT
  pg.*
FROM
  plan_grants AS pg
WHERE
  -- Institution plan grant
  (
    $institution_id::bigint IS NOT NULL
    AND institution_id = $institution_id
    AND course_instance_id IS NULL
    AND user_id IS NULL
  )
  -- Course instance plan grant
  OR (
    $institution_id::bigint IS NOT NULL
    AND $course_instance_id::bigint IS NOT NULL
    AND institution_id = $institution_id
    AND course_instance_id = $course_instance_id
    AND user_id IS NULL
  )
  -- Course instance user plan grant
  OR (
    $institution_id::bigint IS NOT NULL
    AND $course_instance_id::bigint IS NOT NULL
    AND $user_id::bigint IS NOT NULL
    AND institution_id = $institution_id
    AND course_instance_id = $course_instance_id
    AND user_id = $user_id
  )
  -- User plan grant
  OR (
    $user_id::bigint IS NOT NULL
    AND institution_id IS NULL
    AND course_instance_id IS NULL
    AND user_id = $user_id
  );

-- BLOCK select_required_plans_for_course_instance
SELECT
  plan_name
FROM
  course_instance_required_plans
WHERE
  course_instance_id = $course_instance_id;

-- BLOCK select_institution_for_course_instance
SELECT
  i.*
FROM
  institutions AS i
  JOIN pl_courses AS c ON (c.institution_id = i.id)
  JOIN course_instances AS ci ON (ci.course_id = c.id)
WHERE
  ci.id = $course_instance_id;
