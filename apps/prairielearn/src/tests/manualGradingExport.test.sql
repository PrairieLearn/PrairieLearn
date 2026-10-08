-- BLOCK select_assessment_question_by_qid
SELECT
  aq.*
FROM
  assessment_questions AS aq
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  aq.assessment_id = $assessment_id
  AND q.qid = $qid;

-- BLOCK insert_assessment_instance_for_user
INSERT INTO
  assessment_instances (assessment_id, user_id, number, open)
VALUES
  ($assessment_id, $user_id, 1, TRUE)
RETURNING
  id;

-- BLOCK insert_assessment_instance_for_team
INSERT INTO
  assessment_instances (assessment_id, team_id, number, open)
VALUES
  ($assessment_id, $team_id, 1, TRUE)
RETURNING
  id;

-- BLOCK insert_instance_question
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    status,
    assigned_grader,
    last_grader
  )
VALUES
  (
    $assessment_instance_id,
    $assessment_question_id,
    'complete',
    $assigned_grader::bigint,
    $last_grader::bigint
  )
RETURNING
  id;

-- BLOCK insert_team
WITH
  config AS (
    SELECT
      id
    FROM
      team_configs
    WHERE
      assessment_id = $assessment_id
    LIMIT
      1
  ),
  new_team AS (
    INSERT INTO
      teams (course_instance_id, team_config_id, name)
    SELECT
      $course_instance_id,
      config.id,
      $name
    FROM
      config
    RETURNING
      id,
      team_config_id
  ),
  add_users AS (
    INSERT INTO
      team_users (team_id, team_config_id, user_id)
    SELECT
      nt.id,
      nt.team_config_id,
      unnest($member_user_ids::bigint[])
    FROM
      new_team AS nt
  )
SELECT
  id
FROM
  new_team;

-- BLOCK insert_variant
INSERT INTO
  variants (
    instance_question_id,
    question_id,
    course_id,
    user_id,
    authn_user_id,
    variant_seed
  )
SELECT
  iq.id,
  aq.question_id,
  q.course_id,
  ai.user_id,
  ai.user_id,
  'export'
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
WHERE
  iq.id = $instance_question_id
RETURNING
  id;

-- BLOCK insert_submission
INSERT INTO
  submissions (variant_id, date, manual_rubric_grading_id)
VALUES
  (
    $variant_id,
    $date::timestamptz,
    $manual_rubric_grading_id::bigint
  )
RETURNING
  id;

-- BLOCK insert_grading_job
INSERT INTO
  grading_jobs (
    submission_id,
    grading_method,
    graded_at,
    graded_by,
    auto_points,
    manual_points,
    feedback,
    manual_rubric_grading_id,
    deleted_at
  )
VALUES
  (
    $submission_id,
    $grading_method::enum_grading_method,
    $graded_at::timestamptz,
    $graded_by,
    $auto_points,
    $manual_points,
    $feedback::jsonb,
    $manual_rubric_grading_id::bigint,
    $deleted_at::timestamptz
  )
RETURNING
  id;

-- BLOCK insert_rubric
WITH
  new_rubric AS (
    INSERT INTO
      rubrics (
        starting_points,
        min_points,
        max_extra_points,
        replace_auto_points,
        modified_at
      )
    VALUES
      (
        0,
        0,
        0,
        false,
        TIMESTAMPTZ '2020-01-01 00:00:00 UTC'
      )
    RETURNING
      id
  )
UPDATE assessment_questions
SET
  manual_rubric_id = (
    SELECT
      id
    FROM
      new_rubric
  )
WHERE
  id = $assessment_question_id
RETURNING
  manual_rubric_id;

-- BLOCK insert_rubric_item
INSERT INTO
  rubric_items (
    rubric_id,
    number,
    description,
    points,
    deleted_at
  )
VALUES
  (
    $rubric_id,
    $number,
    $description,
    $points,
    $deleted_at::timestamptz
  )
RETURNING
  *;

-- BLOCK insert_rubric_grading
WITH
  new_grading AS (
    INSERT INTO
      rubric_gradings (
        rubric_id,
        starting_points,
        min_points,
        max_extra_points,
        adjust_points,
        computed_points
      )
    VALUES
      (
        $rubric_id,
        0,
        0,
        0,
        $adjust_points,
        $computed_points
      )
    RETURNING
      id
  ),
  items AS (
    INSERT INTO
      rubric_grading_items (
        rubric_grading_id,
        rubric_item_id,
        description,
        points,
        score
      )
    SELECT
      ng.id,
      ri.id,
      ri.description,
      ri.points,
      $score
    FROM
      new_grading AS ng
      CROSS JOIN rubric_items AS ri
    WHERE
      ri.id = ANY ($rubric_item_ids::bigint[])
  )
SELECT
  id
FROM
  new_grading;

-- BLOCK insert_submission_group
INSERT INTO
  instance_question_groups (
    assessment_question_id,
    instance_question_group_name,
    instance_question_group_description
  )
VALUES
  ($assessment_question_id, $name, $description)
RETURNING
  *;

-- BLOCK update_instance_question
UPDATE instance_questions
SET
  ai_instance_question_group_id = $ai_group_id,
  manual_instance_question_group_id = $manual_group_id,
  auto_points = 1,
  manual_points = 3,
  points = 4,
  score_perc = 80
WHERE
  id = $instance_question_id;

-- BLOCK insert_issue
INSERT INTO
  issues (
    assessment_id,
    instance_question_id,
    course_caused,
    open
  )
VALUES
  ($assessment_id, $instance_question_id, true, true);

-- BLOCK delete_rubric_item
UPDATE rubric_items
SET
  description = 'Updated description',
  points = 100,
  deleted_at = CURRENT_TIMESTAMP
WHERE
  id = $rubric_item_id;
