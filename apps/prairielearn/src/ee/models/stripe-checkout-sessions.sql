-- BLOCK insert_stripe_checkout_session_for_user_in_course_instance
INSERT INTO
  stripe_checkout_sessions (
    agent_user_id,
    stripe_object_id,
    course_instance_id,
    subject_user_id,
    data,
    plan_names
  )
VALUES
  (
    $agent_user_id,
    $stripe_object_id,
    $course_instance_id,
    $subject_user_id,
    $data,
    $plan_names
  );

-- BLOCK get_stripe_checkout_session_by_stripe_object_id
SELECT
  *
FROM
  stripe_checkout_sessions
WHERE
  stripe_object_id = $stripe_object_id;

-- BLOCK mark_stripe_checkout_session_completed
UPDATE stripe_checkout_sessions
SET
  completed_at = NOW(),
  plan_grants_created = TRUE
WHERE
  stripe_object_id = $stripe_object_id;

-- BLOCK update_stripe_checkout_session_data
UPDATE stripe_checkout_sessions
SET
  data = $data
WHERE
  stripe_object_id = $stripe_object_id
RETURNING
  *;
