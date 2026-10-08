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
      score_perc_pending = $score_perc_pending,
      grading_pending = $grading_pending,
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
    score_perc_pending,
    grading_pending
  )
SELECT
  ai.id,
  $authn_user_id,
  ai.max_points,
  ai.points,
  ai.score_perc,
  ai.score_perc_pending,
  ai.grading_pending
FROM
  updated_assessment_instance AS ai
WHERE
  $insert_log;

-- BLOCK compute_assessment_instance_points_by_zone
WITH
  all_questions AS (
    SELECT
      iq.id AS iq_id,
      iq.assessment_instance_id,
      z.id AS zone_id,
      iq.points,
      p.id IS NOT NULL AS grading_pending,
      coalesce(p.pending_credit, 0) AS pending_credit,
      iq.points + coalesce(p.pending_points, 0) AS potential_points,
      aq.max_points,
      z.best_questions,
      z.max_points AS zone_max_points
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
      JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
      JOIN zones AS z ON z.id = ag.zone_id
      JOIN assessments AS a ON a.id = aq.assessment_id
      LEFT JOIN jsonb_to_recordset($pending_questions::jsonb) AS p (
        id bigint,
        pending_points double precision,
        pending_credit double precision
      ) ON p.id = iq.id
    WHERE
      iq.assessment_instance_id = ANY ($assessment_instance_ids::bigint[])
      AND (
        aq.deleted_at IS NULL
        OR a.type = 'Exam'
      )
  ),
  ranked_questions AS (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY
          assessment_instance_id,
          zone_id
        ORDER BY
          points DESC,
          iq_id
      ) AS points_rank,
      row_number() OVER (
        PARTITION BY
          assessment_instance_id,
          zone_id
        ORDER BY
          potential_points DESC,
          iq_id
      ) AS potential_points_rank,
      row_number() OVER (
        PARTITION BY
          assessment_instance_id,
          zone_id
        ORDER BY
          max_points DESC,
          iq_id
      ) AS max_points_rank
    FROM
      all_questions
  )
SELECT
  assessment_instance_id,
  zone_id,
  bool_or(grading_pending) AS grading_pending,
  max(pending_credit) AS pending_credit,
  LEAST(
    sum(points) FILTER (
      WHERE
        best_questions IS NULL
        OR points_rank <= best_questions
    ),
    zone_max_points
  ) AS points,
  array_agg(iq_id) FILTER (
    WHERE
      best_questions IS NULL
      OR points_rank <= best_questions
  ) AS iq_ids,
  LEAST(
    sum(potential_points) FILTER (
      WHERE
        best_questions IS NULL
        OR potential_points_rank <= best_questions
    ),
    zone_max_points
  ) AS potential_points,
  LEAST(
    sum(max_points) FILTER (
      WHERE
        best_questions IS NULL
        OR max_points_rank <= best_questions
    ),
    zone_max_points
  ) AS max_points,
  array_agg(iq_id) FILTER (
    WHERE
      best_questions IS NULL
      OR max_points_rank <= best_questions
  ) AS max_iq_ids
FROM
  ranked_questions
GROUP BY
  assessment_instance_id,
  zone_id,
  zone_max_points;

-- BLOCK select_and_lock_assessment_instances_for_pending
SELECT
  ai.*
FROM
  assessment_instances AS ai
WHERE
  ai.id = ANY ($assessment_instance_ids::bigint[])
ORDER BY
  ai.id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK update_assessment_instances_pending
WITH
  updated AS (
    UPDATE assessment_instances AS ai
    SET
      score_perc_pending = p.score_perc_pending,
      grading_pending = p.grading_pending,
      modified_at = now()
    FROM
      jsonb_to_recordset($pending_scores::jsonb) AS p (
        id bigint,
        score_perc_pending double precision,
        grading_pending boolean
      )
    WHERE
      ai.id = p.id
      AND (
        $force_log
        OR ai.score_perc_pending IS DISTINCT FROM p.score_perc_pending
        OR ai.grading_pending IS DISTINCT FROM p.grading_pending
      )
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
    score_perc_pending,
    grading_pending
  )
SELECT
  id,
  $authn_user_id,
  max_points,
  points,
  score_perc,
  score_perc_pending,
  grading_pending
FROM
  updated
WHERE
  $insert_log;
