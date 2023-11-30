-- BLOCK assessment_instance_stats
SELECT
  iq.id AS instance_question_id,
  ai.id AS assessment_instance_id,
  q.title,
  q.qid,
  q.id AS question_id,
  admin_assessment_question_number (aq.id) as number,
  ai.client_fingerprint_id_change_count,
  iq.some_submission,
  iq.some_perfect_submission,
  iq.some_nonzero_submission,
  iq.first_submission_score,
  iq.last_submission_score,
  iq.max_submission_score,
  iq.average_submission_score,
  iq.submission_score_array,
  iq.incremental_submission_points_array,
  iq.incremental_submission_score_array
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessments AS a ON (ai.assessment_id = a.id)
  JOIN course_instances AS ci ON (a.course_instance_id = ci.id)
WHERE
  ai.id = $assessment_instance_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
GROUP BY
  q.id,
  iq.id,
  aq.id,
  ai.id
ORDER BY
  aq.number;

-- BLOCK select_date_formatted_duration
SELECT
  format_date_full_compact (ai.date, ci.display_timezone) AS assessment_instance_date_formatted,
  format_interval (ai.duration) AS assessment_instance_duration
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK select_instance_questions
SELECT
  iq.*,
  -- Convert modified_at to a text representation suitable for
  -- PostgreSQL so it can be properly interpreted when a grade
  -- update POST is received back.
  CAST(iq.modified_at AS TEXT) AS modified_at,
  ((lag(z.id) OVER w) IS DISTINCT FROM z.id) AS start_new_zone,
  z.id AS zone_id,
  z.title AS zone_title,
  q.title AS question_title,
  q.id AS question_id,
  q.qid,
  aq.max_points,
  aq.max_manual_points,
  aq.max_auto_points,
  aq.manual_rubric_id,
  qo.row_order,
  qo.question_number,
  admin_assessment_question_number (aq.id) as instructor_question_number,
  z.max_points AS zone_max_points,
  (z.max_points IS NOT NULL) AS zone_has_max_points,
  z.best_questions AS zone_best_questions,
  (z.best_questions IS NOT NULL) AS zone_has_best_questions
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN question_order (ai.id) AS qo ON (qo.instance_question_id = iq.id)
WHERE
  ai.id = $assessment_instance_id
WINDOW
  w AS (
    ORDER BY
      qo.row_order
  )
ORDER BY
  qo.row_order;
