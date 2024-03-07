-- BLOCK ensure_plan_grant
WITH
  new_plan_grant AS (
    INSERT INTO
      plan_grants (
        institution_id,
        course_instance_id,
        user_id,
        plan_name,
        type
      )
    VALUES
      (
        $institution_id,
        $course_instance_id,
        $user_id,
        $plan_name,
        $type::enum_plan_grant_type
      )
    ON CONFLICT DO NOTHING
    RETURNING
      *
  )
SELECT
  *
FROM
  new_plan_grant
UNION ALL
SELECT
  *
FROM
  plan_grants
WHERE
  institution_id IS NOT DISTINCT FROM $institution_id
  AND course_instance_id IS NOT DISTINCT FROM $course_instance_id
  AND user_id IS NOT DISTINCT FROM $user_id
  AND plan_name = $plan_name;

-- BLOCK update_plan_grant
UPDATE plan_grants
SET
  type = $type
WHERE
  id = $id
RETURNING
  *;

-- BLOCK delete_plan_grant
DELETE FROM plan_grants
WHERE
  id = $id
RETURNING
  *;
