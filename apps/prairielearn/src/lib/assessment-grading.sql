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
