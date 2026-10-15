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
