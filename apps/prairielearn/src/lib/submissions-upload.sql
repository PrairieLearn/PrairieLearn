-- BLOCK select_assessment_question
SELECT
  *
FROM
  assessment_questions
WHERE
  assessment_id = $assessment_id
  AND question_id = $question_id;

-- BLOCK insert_assessment_instance
INSERT INTO
  assessment_instances (assessment_id, user_id, team_id, number, open)
VALUES
  (
    $assessment_id,
    $user_id,
    $group_id,
    $instance_number,
    FALSE -- Assume closed by default when recreating
  )
RETURNING
  id AS assessment_instance_id;

-- BLOCK insert_instance_question
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    requires_manual_grading,
    status
  )
VALUES
  (
    $assessment_instance_id,
    $assessment_question_id,
    $requires_manual_grading,
    'saved' -- Must not be the default 'unanswered' status
  )
RETURNING
  id AS instance_question_id;

-- BLOCK insert_variant
INSERT INTO
  variants (
    course_id,
    course_instance_id,
    instance_question_id,
    question_id,
    authn_user_id,
    user_id,
    team_id,
    variant_seed,
    params,
    true_answer,
    options,
    number
  )
VALUES
  (
    $course_id,
    $course_instance_id,
    $instance_question_id,
    $question_id,
    $authn_user_id,
    $user_id,
    $group_id,
    $seed,
    $params,
    $true_answer,
    $options,
    $number
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
    params,
    true_answer,
    date
  )
VALUES
  (
    $variant_id,
    $authn_user_id,
    $submitted_answer,
    '{}'::jsonb, -- We don't have any useful value for `raw_submitted_answer` here.
    $params,
    $true_answer,
    $submission_date
  )
RETURNING
  id AS submission_id;

-- BLOCK select_rubric_items
SELECT
  *
FROM
  rubric_items AS ri
WHERE
  ri.rubric_id = $rubric_id
  AND ri.deleted_at IS NULL;

-- BLOCK update_assessment_instance_max_points
UPDATE assessment_instances
SET
  max_points = $max_points
WHERE
  id = $assessment_instance_id;
