-- BLOCK select_assessment_question
SELECT
  *
FROM
  assessment_questions
WHERE
  assessment_id = $assessment_id
  AND question_id = $question_id;

-- BLOCK select_group_config
SELECT
  *
FROM
  group_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

-- BLOCK create_group
WITH
  next_group_number AS (
    SELECT
      SUBSTRING(
        g.name
        FROM
          6
      )::integer + 1 AS group_number
    FROM
      groups AS g
      JOIN group_configs AS gc ON (gc.id = g.group_config_id)
    WHERE
      gc.assessment_id = $assessment_id
      AND g.name ~ '^group[0-9]+$'
      AND g.deleted_at IS NULL
    ORDER BY
      group_number DESC
    LIMIT
      1
  ),
  create_group AS (
    INSERT INTO
      groups (name, group_config_id, course_instance_id) (
        SELECT
          COALESCE(
            NULLIF($group_name::text, ''),
            -- If no name is provided, use the next group number.
            (
              SELECT
                'group' || group_number
              FROM
                next_group_number
            ),
            -- If no name is provided and no groups exist, use 'group1'.
            'group1'
          ),
          gc.id,
          gc.course_instance_id
        FROM
          group_configs AS gc
        WHERE
          gc.assessment_id = $assessment_id
          AND gc.deleted_at IS NULL
      )
    RETURNING
      id,
      group_config_id
  )
INSERT INTO
  group_logs (authn_user_id, group_id, action)
SELECT
  $authn_user_id,
  cg.id,
  'create'
FROM
  create_group AS cg
RETURNING
  group_id;

-- BLOCK insert_group_user
WITH
  inserted_user AS (
    INSERT INTO
      group_users (group_id, user_id, group_config_id)
    VALUES
      ($group_id, $user_id, $group_config_id)
    ON CONFLICT DO NOTHING
    RETURNING
      *
  )
INSERT INTO
  group_logs (authn_user_id, user_id, group_id, action)
SELECT
  $authn_user_id,
  iu.user_id,
  iu.group_id,
  'join'
FROM
  inserted_user AS iu;

-- BLOCK insert_assessment_instance
INSERT INTO
  assessment_instances (assessment_id, user_id, number, open)
VALUES
  (
    $assessment_id,
    $user_id,
    $instance_number,
    FALSE -- Assume closed by default when recreating
  )
RETURNING
  id AS assessment_instance_id;

-- BLOCK insert_group_assessment_instance
INSERT INTO
  assessment_instances (assessment_id, group_id, number, open)
VALUES
  (
    $assessment_id,
    $group_id,
    $instance_number,
    FALSE -- Assume closed by default when recreating
  )
RETURNING
  id AS assessment_instance_id;

-- BLOCK select_group_by_name
SELECT
  g.id
FROM
  groups AS g
  JOIN group_configs AS gc ON g.group_config_id = gc.id
WHERE
  g.name = $group_name
  AND gc.assessment_id = $assessment_id
  AND g.deleted_at IS NULL
  AND gc.deleted_at IS NULL;

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
    $seed,
    $params,
    $true_answer,
    $options,
    $number
  )
RETURNING
  id AS variant_id;

-- BLOCK insert_group_variant
INSERT INTO
  variants (
    course_id,
    course_instance_id,
    instance_question_id,
    question_id,
    authn_user_id,
    group_id,
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
