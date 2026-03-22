-- BLOCK select_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK select_instance_questions
SELECT
  iq.*,
  ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
  z.id AS zone_id,
  z.number AS zone_number,
  z.title AS zone_title,
  z.lockpoint,
  (aicl.id IS NOT NULL) AS lockpoint_crossed,
  aicl.crossed_at AS lockpoint_crossed_at,
  lockpoint_user.uid AS lockpoint_crossed_authn_user_uid,
  q.title AS question_title,
  aq.max_points,
  aq.max_manual_points,
  aq.max_auto_points,
  aq.init_points,
  aq.grade_rate_minutes,
  aq.allow_real_time_grading,
  qo.row_order,
  qo.question_number,
  z.max_points AS zone_max_points,
  (z.max_points IS NOT NULL) AS zone_has_max_points,
  z.best_questions AS zone_best_questions,
  (z.best_questions IS NOT NULL) AS zone_has_best_questions,
  (
    count(*) OVER (
      PARTITION BY
        z.id
    )
  )::int AS zone_question_count,
  (
    SELECT
      count(*)
    FROM
      files AS f
    WHERE
      f.instance_question_id = iq.id
      AND f.deleted_at IS NULL
  )::int AS file_count,
  qo.question_access_mode,
  (lag(aq.effective_advance_score_perc) OVER w) AS prev_advance_score_perc,
  CASE
    WHEN a.type = 'Homework' THEN ''
    ELSE 'Question '
  END || (lag(qo.question_number) OVER w) AS prev_title,
  (lag(qo.question_access_mode) OVER w) AS prev_question_access_mode
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  LEFT JOIN assessment_instance_crossed_lockpoints AS aicl ON (
    aicl.zone_id = z.id
    AND aicl.assessment_instance_id = ai.id
  )
  LEFT JOIN users AS lockpoint_user ON (lockpoint_user.id = aicl.authn_user_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN question_order (ai.id) AS qo ON (qo.instance_question_id = iq.id)
WHERE
  ai.id = $assessment_instance_id
  AND (
    aq.deleted_at IS NULL
    OR a.type = 'Exam'
  )
WINDOW
  w AS (
    ORDER BY
      qo.row_order
  )
ORDER BY
  qo.row_order;
