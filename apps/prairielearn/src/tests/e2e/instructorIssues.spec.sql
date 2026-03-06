-- BLOCK close_issue
UPDATE issues
SET
  open = false
WHERE
  id = $issue_id;

-- BLOCK update_assessment_deleted_at
UPDATE assessments
SET
  deleted_at = $deleted_at::timestamptz
WHERE
  id = $assessment_id;

-- BLOCK set_issue_assessment
UPDATE issues
SET
  assessment_id = $assessment_id
WHERE
  id = $issue_id;

-- BLOCK update_assessment_set_id
UPDATE assessments
SET
  assessment_set_id = $assessment_set_id
WHERE
  id = $assessment_id;

-- BLOCK insert_test_variant
INSERT INTO
  variants (
    question_id,
    course_id,
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
    $authn_user_id,
    $user_id,
    $variant_seed,
    '{}',
    '{}',
    '{}'
  )
RETURNING
  id;
