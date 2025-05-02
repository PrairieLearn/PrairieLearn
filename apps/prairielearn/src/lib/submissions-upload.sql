-- BLOCK ensure_user
INSERT INTO
  users (uid, uin, name) -- Assuming role is handled elsewhere or not needed here
VALUES
  ($uid, $uin, $name)
ON CONFLICT (uid) DO UPDATE
SET
  uin = EXCLUDED.uin,
  name = EXCLUDED.name
RETURNING
  user_id;

-- BLOCK ensure_group
INSERT INTO
  groups (group_name, course_instance_id)
VALUES
  ($group_name, $course_instance_id)
ON CONFLICT (group_name, course_instance_id) DO UPDATE
SET
  group_name = EXCLUDED.group_name -- Dummy update to get returning id
RETURNING
  id AS group_id;

-- BLOCK ensure_assessment_instance_user
INSERT INTO
  assessment_instances (assessment_id, user_id, number, open)
VALUES
  (
    $assessment_id,
    $user_id,
    $instance_number,
    false -- Assume closed by default when recreating
  )
ON CONFLICT (assessment_id, user_id, number) DO UPDATE
SET
  assessment_id = EXCLUDED.assessment_id -- Dummy update
RETURNING
  id AS assessment_instance_id;

-- BLOCK ensure_assessment_instance_group
INSERT INTO
  assessment_instances (assessment_id, group_id, number, open)
VALUES
  (
    $assessment_id,
    $group_id,
    $instance_number,
    false -- Assume closed by default when recreating
  )
ON CONFLICT (assessment_id, group_id, number) DO UPDATE
SET
  assessment_id = EXCLUDED.assessment_id -- Dummy update
RETURNING
  id AS assessment_instance_id;

-- BLOCK select_assessment_question
SELECT
  *
FROM
  assessment_questions
WHERE
  assessment_id = $assessment_id
  AND question_id = $question_id;

-- BLOCK insert_instance_question
INSERT INTO
  instance_questions (assessment_instance_id, assessment_question_id)
VALUES
  ($assessment_instance_id, $assessment_question_id)
RETURNING
  id AS instance_question_id;

-- BLOCK insert_variant
INSERT INTO
  variants (
    instance_question_id,
    question_id,
    authn_user_id,
    user_id,
    group_id,
    variant_seed,
    params,
    true_answer,
    options,
    broken,
    course_id
  )
VALUES
  (
    $instance_question_id,
    $question_id,
    $authn_user_id,
    $user_id,
    $group_id,
    $seed,
    $params,
    $true_answer,
    $options,
    false,
    $course_id
  )
RETURNING
  id AS variant_id;

-- BLOCK insert_submission
INSERT INTO
  submissions (
    variant_id,
    auth_user_id,
    submitted_answer,
    raw_submitted_answer,
    partial_scores,
    override_score,
    credit,
    mode,
    grading_requested_at,
    graded_at,
    score,
    correct,
    feedback,
    params,
    true_answer,
    broken,
    gradable,
    date
  )
VALUES
  (
    $variant_id,
    $authn_user_id,
    $submitted_answer,
    NULL, -- We don't have anything useful to use as the raw submitted answer.
    $partial_scores,
    $override_score,
    $credit,
    $mode,
    $grading_requested_at,
    $graded_at,
    $score,
    $correct,
    $feedback,
    $params, -- Re-inserting variant params/true_answers for history
    $true_answer,
    false,
    true, -- Assume gradable
    $submission_date
  )
RETURNING
  id AS submission_id;
