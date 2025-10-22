-- BLOCK select_and_lock_assessment_instance
SELECT
  *
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK select_credit_of_last_submission
SELECT
  s.credit
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  s.date DESC
LIMIT
  1;

-- BLOCK update_assessment_instance_grade
WITH
  updated_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      used_for_grade = (
        iq.id = ANY ($instance_questions_used_for_grade::bigint[])
      )
    WHERE
      iq.assessment_instance_id = $assessment_instance_id
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      points = $points,
      score_perc = $score_perc,
      modified_at = now()
    WHERE
      ai.id = $assessment_instance_id
    RETURNING
      ai.*
  )
INSERT INTO
  assessment_score_logs (
    assessment_instance_id,
    auth_user_id,
    max_points,
    points,
    score_perc
  )
SELECT
  ai.id,
  $authn_user_id,
  ai.max_points,
  ai.points,
  ai.score_perc
FROM
  updated_assessment_instance AS ai
WHERE
  $insert_log;
