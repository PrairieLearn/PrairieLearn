-- BLOCK insert_plan_grant
INSERT INTO
  plan_grants (
    institution_id,
    course_instance_id,
    enrollment_id,
    user_id,
    plan_name,
    type
  )
VALUES
  (
    $institution_id,
    $course_instance_id,
    $enrollment_id,
    $user_id,
    $plan_name,
    $type::enum_plan_grant_type
  )
RETURNING
  *;

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
