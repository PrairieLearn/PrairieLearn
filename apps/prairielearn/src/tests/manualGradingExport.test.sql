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

-- BLOCK insert_submission_for_instance_question
WITH
  new_variant AS (
    INSERT INTO
      variants (
        instance_question_id,
        question_id,
        course_id,
        course_instance_id,
        user_id,
        authn_user_id,
        variant_seed
      )
    SELECT
      iq.id,
      aq.question_id,
      q.course_id,
      a.course_instance_id,
      ai.user_id,
      ai.user_id AS authn_user_id,
      'export'
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
      JOIN questions AS q ON q.id = aq.question_id
      JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
      JOIN assessments AS a ON a.id = ai.assessment_id
    WHERE
      iq.id = $instance_question_id
    RETURNING
      id
  )
INSERT INTO
  submissions (variant_id)
SELECT
  id
FROM
  new_variant
RETURNING
  id;
