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

-- BLOCK ensure_assessment_question
INSERT INTO
  assessment_questions (
    assessment_id,
    question_id,
    max_points,
    max_manual_points,
    max_auto_points,
    points_list,
    init_points,
    grade_rate_mins
  )
VALUES
  (
    $assessment_id,
    $question_id,
    $max_points,
    $max_manual_points,
    $max_auto_points,
    NULL, -- points_list not easily recreated
    COALESCE(
      $max_points,
      $max_manual_points,
      $max_auto_points,
      0
    ),
    0
  )
ON CONFLICT (assessment_id, question_id, number) DO UPDATE
SET
  max_points = EXCLUDED.max_points,
  max_manual_points = EXCLUDED.max_manual_points,
  max_auto_points = EXCLUDED.max_auto_points
RETURNING
  id AS assessment_question_id;

-- BLOCK ensure_instance_question
INSERT INTO
  instance_questions (assessment_instance_id, assessment_question_id)
VALUES
  ($assessment_instance_id, $assessment_question_id)
ON CONFLICT (assessment_instance_id, assessment_question_id) DO UPDATE
SET
  assessment_instance_id = EXCLUDED.assessment_instance_id -- Dummy update
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

-- BLOCK ensure_submission
INSERT INTO
  submissions (
    id,
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
    $submission_id,
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
ON CONFLICT (id) DO UPDATE
SET
  submitted_answer = EXCLUDED.submitted_answer,
  raw_submitted_answer = EXCLUDED.raw_submitted_answer,
  partial_scores = EXCLUDED.partial_scores,
  override_score = EXCLUDED.override_score,
  credit = EXCLUDED.credit,
  mode = EXCLUDED.mode,
  grading_requested_at = EXCLUDED.grading_requested_at,
  graded_at = EXCLUDED.graded_at,
  score = EXCLUDED.score,
  correct = EXCLUDED.correct,
  feedback = EXCLUDED.feedback,
  date = EXCLUDED.date
RETURNING
  id AS submission_id;
