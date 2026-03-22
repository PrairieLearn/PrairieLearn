-- BLOCK select_regrade_assessment_instance_info
SELECT
  to_jsonb(ai) AS assessment_instance,
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(u) AS instance_user,
  to_jsonb(g) AS instance_group,
  to_jsonb(ci) AS course_instance,
  to_jsonb(c) AS course
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  LEFT JOIN teams AS g ON (g.id = ai.team_id)
WHERE
  ai.id = $assessment_instance_id
  AND g.deleted_at IS NULL;

-- BLOCK select_regrade_assessment_instances
SELECT
  to_jsonb(ai) AS assessment_instance,
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(u) AS instance_user,
  to_jsonb(g) AS instance_group
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  LEFT JOIN teams AS g ON (g.id = ai.team_id)
WHERE
  a.id = $assessment_id
  AND g.deleted_at IS NULL
ORDER BY
  u.uid,
  u.id,
  ai.number;

-- BLOCK select_and_lock_assessment_instance
SELECT
  ai.*,
  a.type AS assessment_type
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.id = $assessment_instance_id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK regrade_instance_questions
WITH
  updated_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      points = aq.max_points,
      auto_points = aq.max_auto_points,
      manual_points = aq.max_manual_points,
      score_perc = 100,
      requires_manual_grading = FALSE,
      -- If the question was unanswered, the status remains unanswered. Otherwise, it becomes complete.
      status = CASE
        WHEN iq.status = 'unanswered' THEN 'unanswered'::enum_instance_question_status
        ELSE 'complete'::enum_instance_question_status
      END,
      modified_at = now()
    FROM
      assessment_questions AS aq
    WHERE
      aq.id = iq.assessment_question_id
      AND iq.assessment_instance_id = $assessment_instance_id
      AND aq.force_max_points
      AND iq.points < aq.max_points
    RETURNING
      iq.*,
      aq.max_points,
      aq.max_auto_points,
      aq.max_manual_points
  ),
  log_result AS (
    INSERT INTO
      question_score_logs (
        instance_question_id,
        auth_user_id,
        points,
        auto_points,
        manual_points,
        max_points,
        max_auto_points,
        max_manual_points,
        score_perc
      )
    SELECT
      id,
      $authn_user_id,
      points,
      auto_points,
      manual_points,
      max_points,
      max_auto_points,
      max_manual_points,
      score_perc
    FROM
      updated_instance_questions
  )
SELECT
  q.qid
FROM
  updated_instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id);
