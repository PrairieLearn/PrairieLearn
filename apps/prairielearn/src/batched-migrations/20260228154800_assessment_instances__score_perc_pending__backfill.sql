-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessment_instances;

-- BLOCK update_assessment_instances_score_perc_pending
WITH
  target_assessment_instances AS (
    SELECT
      ai.id,
      ai.max_points
    FROM
      assessment_instances AS ai
    WHERE
      ai.id >= $start
      AND ai.id <= $end
  ),
  all_questions AS (
    SELECT
      tai.id AS assessment_instance_id,
      iq.id AS iq_id,
      z.id AS zone_id,
      a.type AS assessment_type,
      iq.status,
      iq.auto_points,
      iq.manual_points,
      iq.current_value,
      iq.points_list,
      iq.variants_points_list,
      aq.max_points,
      aq.max_auto_points,
      aq.max_manual_points,
      aq.init_points,
      iq.requires_manual_grading,
      row_number() OVER (
        PARTITION BY
          tai.id,
          z.id
        ORDER BY
          aq.max_points DESC
      ) AS max_points_rank,
      z.best_questions,
      z.max_points AS zone_max_points
    FROM
      target_assessment_instances AS tai
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = tai.id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
      JOIN assessments AS a ON (a.id = aq.assessment_id)
    WHERE
      -- drop deleted questions unless assessment type is Exam
      (
        aq.deleted_at IS NULL
        OR a.type = 'Exam'
      )
  ),
  max_points_questions AS (
    SELECT
      *
    FROM
      all_questions AS allq
    WHERE
      (
        (allq.max_points_rank <= allq.best_questions)
        OR (allq.best_questions IS NULL)
      )
  ),
  pending_question_inputs AS (
    SELECT
      mpq.assessment_instance_id,
      mpq.zone_id,
      mpq.assessment_type,
      mpq.status,
      mpq.requires_manual_grading,
      COALESCE(mpq.max_auto_points, 0) AS max_auto_points,
      COALESCE(mpq.max_manual_points, 0) AS max_manual_points,
      COALESCE(mpq.auto_points, 0) AS auto_points,
      GREATEST(
        0,
        COALESCE(mpq.current_value, 0) - COALESCE(mpq.max_manual_points, 0)
      ) AS current_auto_value,
      GREATEST(
        0,
        COALESCE(mpq.init_points, 0) - COALESCE(mpq.max_manual_points, 0)
      ) AS init_auto_value,
      COALESCE(array_length(mpq.variants_points_list, 1), 0) AS variants_points_count,
      COALESCE(
        mpq.variants_points_list[array_length(mpq.variants_points_list, 1)],
        0
      ) AS last_variant_points,
      GREATEST(
        0,
        COALESCE(mpq.points_list[1], mpq.current_value, 0) - COALESCE(mpq.max_manual_points, 0)
      ) AS next_exam_auto_value,
      mpq.zone_max_points
    FROM
      max_points_questions AS mpq
  ),
  pending_question_amounts AS (
    SELECT
      pqi.assessment_instance_id,
      pqi.zone_id,
      pqi.status,
      CASE
        WHEN pqi.max_manual_points > 0
        AND pqi.requires_manual_grading THEN pqi.max_manual_points
        ELSE 0
      END AS manual_pending_points,
      GREATEST(0, pqi.max_auto_points - pqi.auto_points) AS remaining_auto_points,
      CASE
        WHEN pqi.assessment_type = 'Homework' THEN (
          CASE
            WHEN pqi.variants_points_count = 0
            OR pqi.last_variant_points >= pqi.init_auto_value THEN pqi.current_auto_value
            ELSE pqi.current_auto_value - pqi.last_variant_points
          END
        )
        ELSE pqi.next_exam_auto_value
      END AS auto_pending_limit,
      pqi.max_auto_points,
      pqi.zone_max_points
    FROM
      pending_question_inputs AS pqi
  ),
  pending_by_question AS (
    SELECT
      pqa.assessment_instance_id,
      pqa.zone_id,
      pqa.manual_pending_points + (
        CASE
          WHEN pqa.status IN ('saved', 'grading')
          AND pqa.max_auto_points > 0 THEN LEAST(pqa.remaining_auto_points, pqa.auto_pending_limit)
          ELSE 0
        END
      ) AS pending_points,
      pqa.zone_max_points
    FROM
      pending_question_amounts AS pqa
  ),
  pending_by_zone AS (
    SELECT
      pbq.assessment_instance_id,
      pbq.zone_id,
      CASE
        WHEN pbq.zone_max_points IS NULL THEN sum(pbq.pending_points)
        ELSE LEAST(sum(pbq.pending_points), pbq.zone_max_points)
      END AS pending_points
    FROM
      pending_by_question AS pbq
    GROUP BY
      pbq.assessment_instance_id,
      pbq.zone_id,
      pbq.zone_max_points
  ),
  pending_total AS (
    SELECT
      assessment_instance_id,
      COALESCE(sum(pending_points), 0) AS pending_points
    FROM
      pending_by_zone
    GROUP BY
      assessment_instance_id
  ),
  new_pending AS (
    SELECT
      tai.id,
      CASE
        WHEN tai.max_points IS NULL
        OR tai.max_points <= 0 THEN 0
        ELSE LEAST(
          100,
          GREATEST(
            0,
            (COALESCE(pt.pending_points, 0) * 100) / tai.max_points
          )
        )
      END AS score_perc_pending
    FROM
      target_assessment_instances AS tai
      LEFT JOIN pending_total AS pt ON (pt.assessment_instance_id = tai.id)
  )
UPDATE assessment_instances AS ai
SET
  score_perc_pending = np.score_perc_pending,
  modified_at = now()
FROM
  new_pending AS np
WHERE
  ai.id = np.id
  AND ai.score_perc_pending IS DISTINCT FROM np.score_perc_pending;
