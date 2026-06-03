-- BLOCK compute_next_allowed_grading_time_ms
SELECT
  GREATEST(
    0,
    floor(
      DATE_PART(
        'epoch',
        (
          MAX(
            gj.date + aq.grade_rate_minutes * make_interval(mins => 1)
          ) - CURRENT_TIMESTAMP
        )
      ) * 1000
    )
  )
FROM
  instance_questions iq
  JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
  JOIN variants v ON (v.instance_question_id = iq.id)
  JOIN submissions s ON (s.variant_id = v.id)
  JOIN grading_jobs gj ON (gj.submission_id = s.id)
WHERE
  iq.id = $instance_question_id
  AND aq.grade_rate_minutes IS NOT NULL
  AND gj.gradable
  AND gj.grading_method NOT IN ('Manual', 'AI');

-- BLOCK select_open_instance_questions_for_assessment
WITH
  random_user_per_group AS (
    SELECT DISTINCT
      ON (gu.team_id) gu.team_id,
      gu.user_id
    FROM
      team_configs AS gc
      JOIN team_users AS gu ON gc.id = gu.team_config_id
    WHERE
      gc.assessment_id = $assessment_id
  )
SELECT
  TO_JSONB(iq.*) AS instance_question,
  TO_JSONB(q.*) AS question,
  TO_JSONB(u.*) AS user,
  TO_JSONB(c.*) AS question_course
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON ai.id = iq.assessment_instance_id
  JOIN assessment_questions AS aq ON iq.assessment_question_id = aq.id
  JOIN questions AS q ON aq.question_id = q.id
  JOIN courses AS c ON q.course_id = c.id
  LEFT JOIN random_user_per_group AS rug ON rug.team_id = ai.team_id
  JOIN users AS u ON u.id = COALESCE(ai.user_id, rug.user_id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.open
  AND iq.open;
