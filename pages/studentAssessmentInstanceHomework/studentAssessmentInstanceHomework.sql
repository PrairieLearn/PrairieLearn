-- BLOCK select_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK get_questions
WITH
  variant_max_submission_scores AS (
    SELECT
      v.id AS variant_id,
      max(s.score) AS max_submission_score
    FROM
      instance_questions AS iq
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
      iq.assessment_instance_id = $assessment_instance_id
      AND aq.deleted_at IS NULL
      AND s.score IS NOT NULL
    GROUP BY
      v.id
  ),
  instance_question_variants AS (
    SELECT
      iq.id AS instance_question_id,
      jsonb_agg(
        jsonb_build_object(
          'variant_id',
          v.id,
          'max_submission_score',
          COALESCE(vmss.max_submission_score, 0)
        )
        ORDER BY
          v.date
      ) AS variants
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      LEFT JOIN variant_max_submission_scores AS vmss ON (vmss.variant_id = v.id)
    WHERE
      iq.assessment_instance_id = $assessment_instance_id
      AND aq.deleted_at IS NULL
      AND NOT v.open
      AND NOT v.broken
    GROUP BY
      iq.id
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
  COALESCE(iqv.variants, '[]'::jsonb) AS previous_variants
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN question_order ($assessment_instance_id) AS qo ON (iq.id = qo.instance_question_id)
  LEFT JOIN instance_question_variants AS iqv ON (iqv.instance_question_id = iq.id)
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
