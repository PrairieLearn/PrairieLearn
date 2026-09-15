-- BLOCK select_assessment_question
SELECT
  aq.id
FROM
  assessment_questions AS aq
WHERE
  aq.assessment_id = $assessment_id
ORDER BY
  aq.id
LIMIT
  1;

-- BLOCK insert_instance_question
WITH
  assessment_instance AS (
    INSERT INTO
      assessment_instances (assessment_id, user_id, number, open)
    VALUES
      ($assessment_id, $user_id, 1, TRUE)
    RETURNING
      id
  )
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    status,
    requires_manual_grading
  )
SELECT
  id,
  $assessment_question_id,
  'complete',
  TRUE
FROM
  assessment_instance;

-- BLOCK insert_group_instance_question
WITH
  new_team AS (
    INSERT INTO
      teams (course_instance_id, team_config_id, name)
    SELECT
      $course_instance_id,
      id,
      'Label test group'
    FROM
      team_configs
    WHERE
      assessment_id = $assessment_id
    RETURNING
      id
  ),
  assessment_instance AS (
    INSERT INTO
      assessment_instances (assessment_id, team_id, number, open)
    SELECT
      $assessment_id,
      id,
      1,
      TRUE
    FROM
      new_team
    RETURNING
      id
  )
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    status,
    requires_manual_grading
  )
SELECT
  id,
  $assessment_question_id,
  'complete',
  TRUE
FROM
  assessment_instance;
