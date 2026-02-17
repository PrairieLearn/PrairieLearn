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
    score_perc,
    score_perc_pending
  )
SELECT
  ai.id,
  $authn_user_id,
  ai.max_points,
  ai.points,
  ai.score_perc,
  ai.score_perc_pending
FROM
  updated_assessment_instance AS ai
WHERE
  $insert_log;

-- BLOCK compute_assessment_instance_points_by_zone
WITH
  all_questions AS (
    SELECT
      iq.id AS iq_id,
      z.id AS zone_id,
      iq.points,
      row_number() OVER (
        PARTITION BY
          z.id
        ORDER BY
          iq.points DESC
      ) AS points_rank,
      aq.max_points,
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
      iq.assessment_instance_id = $assessment_instance_id
      -- drop deleted questions unless assessment type is Exam
      AND (
        aq.deleted_at IS NULL
        OR a.type = 'Exam'
      )
  ),
  points_questions AS (
    SELECT
      allq.iq_id,
      allq.zone_id,
      allq.points,
      allq.zone_max_points
    FROM
      all_questions AS allq
    WHERE
      (
        (allq.points_rank <= allq.best_questions)
        OR (allq.best_questions IS NULL)
      )
  ),
  max_points_questions AS (
    SELECT
      allq.iq_id,
      allq.zone_id,
      allq.max_points,
      allq.zone_max_points
    FROM
      all_questions AS allq
    WHERE
      (
        (allq.max_points_rank <= allq.best_questions)
        OR (allq.best_questions IS NULL)
      )
  ),
  points_zones AS (
    SELECT
      ptsq.zone_id,
      LEAST(sum(ptsq.points), ptsq.zone_max_points) AS points,
      array_agg(ptsq.iq_id) AS iq_ids
    FROM
      points_questions AS ptsq
    GROUP BY
      ptsq.zone_id,
      ptsq.zone_max_points
  ),
  max_points_zones AS (
    SELECT
      ptsq.zone_id,
      LEAST(sum(ptsq.max_points), ptsq.zone_max_points) AS max_points,
      array_agg(ptsq.iq_id) AS max_iq_ids
    FROM
      max_points_questions AS ptsq
    GROUP BY
      ptsq.zone_id,
      ptsq.zone_max_points
  )
SELECT
  pz.zone_id,
  pz.points,
  pz.iq_ids,
  mpz.max_points,
  mpz.max_iq_ids
FROM
  points_zones AS pz
  INNER JOIN max_points_zones AS mpz USING (zone_id);

-- BLOCK update_assessment_instances_score_perc_pending
WITH
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
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
      JOIN assessments AS a ON (a.id = aq.assessment_id)
    WHERE
      ai.id = ANY ($assessment_instance_ids::bigint[])
      -- drop deleted questions unless assessment type is Exam
      AND (
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
  pending_by_zone AS (
    SELECT
      mpq.assessment_instance_id,
      mpq.zone_id,
      CASE
        WHEN mpq.zone_max_points IS NULL THEN sum(
          CASE
            WHEN COALESCE(mpq.max_manual_points, 0) > 0
            AND mpq.requires_manual_grading THEN COALESCE(mpq.max_manual_points, 0)
            ELSE 0
          END
        )
        ELSE LEAST(
          sum(
            CASE
              WHEN COALESCE(mpq.max_manual_points, 0) > 0
              AND mpq.requires_manual_grading THEN COALESCE(mpq.max_manual_points, 0)
              ELSE 0
            END
          ),
          mpq.zone_max_points
        )
      END AS pending_points
    FROM
      max_points_questions AS mpq
    GROUP BY
      mpq.assessment_instance_id,
      mpq.zone_id,
      mpq.zone_max_points
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
      ai.id,
      CASE
        WHEN ai.max_points IS NULL
        OR ai.max_points <= 0 THEN 0
        ELSE LEAST(
          100,
          GREATEST(
            0,
            (COALESCE(pt.pending_points, 0) * 100) / ai.max_points
          )
        )
      END AS score_perc_pending
    FROM
      assessment_instances AS ai
      LEFT JOIN pending_total AS pt ON (pt.assessment_instance_id = ai.id)
    WHERE
      ai.id = ANY ($assessment_instance_ids::bigint[])
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
