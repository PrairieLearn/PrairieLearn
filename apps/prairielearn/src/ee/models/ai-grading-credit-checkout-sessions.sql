-- BLOCK insert_ai_grading_credit_checkout_session
INSERT INTO
  ai_grading_credit_checkout_sessions (
    agent_user_id,
    stripe_object_id,
    course_instance_id,
    data,
    amount_cents
  )
VALUES
  (
    $agent_user_id,
    $stripe_object_id,
    $course_instance_id,
    $data,
    $amount_cents
  );

-- BLOCK get_ai_grading_credit_checkout_session_by_stripe_object_id
SELECT
  *
FROM
  ai_grading_credit_checkout_sessions
WHERE
  stripe_object_id = $stripe_object_id;

-- BLOCK mark_ai_grading_credit_checkout_session_completed
UPDATE ai_grading_credit_checkout_sessions
SET
  completed_at = NOW(),
  credits_added = TRUE
WHERE
  stripe_object_id = $stripe_object_id;

-- BLOCK update_ai_grading_credit_checkout_session_data
UPDATE ai_grading_credit_checkout_sessions
SET
  data = $data
WHERE
  stripe_object_id = $stripe_object_id
RETURNING
  *;
