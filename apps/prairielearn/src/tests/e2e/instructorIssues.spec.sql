-- BLOCK close_issue
UPDATE issues
SET
  open = false
WHERE
  id = $issue_id;

-- BLOCK set_assessment_state
UPDATE assessments
SET
  assessment_set_id = $assessment_set_id,
  deleted_at = $deleted_at::timestamptz,
  tid = $tid
WHERE
  id = $assessment_id;

-- BLOCK insert_test_variant
INSERT INTO
  variants (
    question_id,
    course_id,
    course_instance_id,
    instance_question_id,
    authn_user_id,
    user_id,
    variant_seed,
    params,
    true_answer,
    options
  )
VALUES
  (
    $question_id,
    $course_id,
    $course_instance_id,
    $instance_question_id,
    $authn_user_id,
    $user_id,
    $variant_seed,
    '{}',
    '{}',
    '{}'
  )
RETURNING
  id;

-- BLOCK select_instance_question_id
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND aq.question_id = $question_id;
