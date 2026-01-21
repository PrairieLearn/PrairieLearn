-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $iqId;

-- BLOCK get_assessment_instance_for_iq
SELECT
  ai.*
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
WHERE
  iq.id = $iqId;

-- BLOCK get_expected_score_perc_pending_for_iq
WITH
  target_ai AS (
    SELECT
      ai.id,
      ai.max_points
    FROM
      assessment_instances AS ai
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
    WHERE
      iq.id = $iqId
  ),
  all_questions AS (
    SELECT
      ai.id AS assessment_instance_id,
      iq.id AS iq_id,
      z.id AS zone_id,
      aq.max_points,
      aq.max_manual_points,
      iq.requires_manual_grading,
      row_number() OVER (
        PARTITION BY
          ai.id,
          z.id
        ORDER BY
          aq.max_points DESC
      ) AS max_points_rank,
      z.best_questions,
      z.max_points AS zone_max_points
    FROM
      assessment_instances AS ai
      JOIN target_ai AS t ON (t.id = ai.id)
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
      JOIN assessments AS a ON (a.id = aq.assessment_id)
    WHERE
      aq.deleted_at IS NULL
      OR a.type = 'Exam'
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
  pending_by_zone AS (
    SELECT
      mpq.zone_id,
      CASE
        WHEN mpq.zone_max_points IS NULL THEN sum(
          CASE
            WHEN coalesce(mpq.max_manual_points, 0) > 0
            AND mpq.requires_manual_grading THEN coalesce(mpq.max_manual_points, 0)
            ELSE 0
          END
        )
        ELSE LEAST(
          sum(
            CASE
              WHEN coalesce(mpq.max_manual_points, 0) > 0
              AND mpq.requires_manual_grading THEN coalesce(mpq.max_manual_points, 0)
              ELSE 0
            END
          ),
          mpq.zone_max_points
        )
      END AS pending_points
    FROM
      max_points_questions AS mpq
    GROUP BY
      mpq.zone_id,
      mpq.zone_max_points
  ),
  pending_total AS (
    SELECT
      coalesce(sum(pending_points), 0) AS pending_points
    FROM
      pending_by_zone
  )
SELECT
  CASE
    WHEN t.max_points IS NULL
    OR t.max_points <= 0 THEN 0
    ELSE LEAST(
      100,
      GREATEST(
        0,
        (pending_total.pending_points * 100) / t.max_points
      )
    )
  END AS expected_score_perc_pending
FROM
  target_ai AS t
  LEFT JOIN pending_total ON (TRUE);
