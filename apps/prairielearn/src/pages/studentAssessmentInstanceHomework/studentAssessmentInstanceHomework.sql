-- BLOCK select_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK get_questions
WITH group_role_ids AS (
    SELECT group_role_id
    FROM group_user_roles AS gur
    JOIN groups AS g ON gur.group_id = g.id
    JOIN assessment_instances AS ai ON g.id = ai.group_id
    WHERE gur.user_id = $user_id AND ai.id = $assessment_instance_id
)
SELECT
  iq.*,
  ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
  z.id AS zone_id,
  z.title AS zone_title,
  q.title AS question_title,
  aq.max_points,
  aq.max_manual_points,
  aq.max_auto_points,
  qo.row_order,
  qo.question_number,
  aq.init_points,
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
  ) AS file_count,
  qo.sequence_locked AS sequence_locked,
  (lag(aq.effective_advance_score_perc) OVER w) AS prev_advance_score_perc,
  (lag(qo.question_number) OVER w) AS prev_title,
  (lag(qo.sequence_locked) OVER w) AS prev_sequence_locked,
  (
    SELECT bool_or(aqrp.can_view)
    FROM assessment_questions AS aq
    JOIN assessment_question_role_permissions AS aqrp ON aqrp.assessment_question_id = aq.id
    WHERE aq.id = iq.assessment_question_id
      AND aqrp.group_role_id IN (SELECT group_role_id FROM group_role_ids)
  ) AS can_view
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN question_order ($assessment_instance_id) AS qo ON (iq.id = qo.instance_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND aq.deleted_at IS NULL
WINDOW
  w AS (
    ORDER BY
      qo.row_order
  )
ORDER BY
  qo.row_order;
