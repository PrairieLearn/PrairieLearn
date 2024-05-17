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
  z.title AS zone_title,
  q.title AS question_title,
  aq.max_points,
  aq.max_manual_points,
  aq.max_auto_points,
  aq.init_points,
  qo.row_order,
  qo.question_number,
  z.max_points AS zone_max_points,
  (z.max_points IS NOT NULL) AS zone_has_max_points,
  z.best_questions AS zone_best_questions,
  (z.best_questions IS NOT NULL) AS zone_has_best_questions,
  (
    SELECT
      count(*)
    FROM
      files AS f
    WHERE
      f.instance_question_id = iq.id
      AND f.deleted_at IS NULL
  )::INT AS file_count,
  qo.sequence_locked AS sequence_locked,
  (lag(aq.effective_advance_score_perc) OVER w) AS prev_advance_score_perc,
  CASE
    WHEN a.type = 'Homework' THEN ''
    ELSE 'Question '
  END || (lag(qo.question_number) OVER w) AS prev_title,
  (lag(qo.sequence_locked) OVER w) AS prev_sequence_locked,
  iqnag.*
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN question_order (ai.id) AS qo ON (qo.instance_question_id = iq.id)
  JOIN instance_questions_next_allowed_grade (iq.id) AS iqnag ON TRUE
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
