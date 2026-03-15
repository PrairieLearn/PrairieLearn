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
  ai AS (
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
      iq.id AS iq_id,
      z.id AS zid,
      aq.max_manual_points,
      iq.requires_manual_grading,
      row_number() OVER (
        PARTITION BY
          z.id
        ORDER BY
          aq.max_points DESC
      ) AS max_points_rank,
      z.best_questions,
      z.max_points AS zone_max_points
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
      JOIN assessments AS a ON (a.id = aq.assessment_id)
    WHERE
      iq.assessment_instance_id = (
        SELECT
          id
        FROM
          ai
      )
      AND (
        aq.deleted_at IS NULL
        OR a.type = 'Exam'
      )
  ),
  used_iq AS (
    SELECT
      allq.zid,
      allq.iq_id,
      allq.max_manual_points,
      allq.requires_manual_grading,
      allq.zone_max_points
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
      u.zid,
      CASE
        WHEN u.zone_max_points IS NULL THEN sum(
          CASE
            WHEN coalesce(u.max_manual_points, 0) > 0
            AND u.requires_manual_grading THEN coalesce(u.max_manual_points, 0)
            ELSE 0
          END
        )
        ELSE LEAST(
          sum(
            CASE
              WHEN coalesce(u.max_manual_points, 0) > 0
              AND u.requires_manual_grading THEN coalesce(u.max_manual_points, 0)
              ELSE 0
            END
          ),
          u.zone_max_points
        )
      END AS pending_points
    FROM
      used_iq AS u
    GROUP BY
      u.zid,
      u.zone_max_points
  ),
  pending AS (
    SELECT
      coalesce(sum(pending_points), 0) AS pending_points
    FROM
      pending_by_zone
  )
SELECT
  CASE
    WHEN (
      SELECT
        max_points
      FROM
        ai
    ) IS NULL
    OR (
      SELECT
        max_points
      FROM
        ai
    ) <= 0 THEN 0
    ELSE LEAST(
      100,
      GREATEST(
        0,
        (
          pending.pending_points / (
            SELECT
              max_points
            FROM
              ai
          )
        ) * 100
      )
    )
  END AS expected_score_perc_pending
FROM
  pending;
