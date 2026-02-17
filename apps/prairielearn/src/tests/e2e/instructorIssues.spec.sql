-- BLOCK close_issue
UPDATE issues
SET
  open = false
WHERE
  id = $issue_id;

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
