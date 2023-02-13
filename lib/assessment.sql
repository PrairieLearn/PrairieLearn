-- BLOCK check_belongs
SELECT
  ai.id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.id = $assessment_instance_id
  AND a.id = $assessment_id;

-- BLOCK select_assessment_for_grading_job
SELECT
  ai.id AS assessment_instance_id
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON (s.id = gj.submission_id)
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  gj.id = $grading_job_id;

-- BLOCK select_assessment_info
SELECT
  assessment_label (a, aset),
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

-- BLOCK select_instances_to_grade
SELECT
  ai.id AS assessment_instance_id,
  ai.number AS instance_number,
  COALESCE(u.uid, 'group ' || g.name) AS username
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN groups AS g ON (
    g.id = ai.group_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
  a.id = $assessment_id
  AND ai.open;

-- BLOCK unset_grading_needed
UPDATE assessment_instances AS ai
SET
  grading_needed = FALSE
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK select_assessments_for_statistics_update
SELECT
  a.id AS assessment_id
FROM
  assessments AS a
WHERE
  a.course_instance_id = $course_instance_id
  AND EXISTS (
    SELECT
      1
    FROM
      assessment_instances AS ai
    WHERE
      ai.assessment_id = a.id
      AND ai.modified_at > a.statistics_last_updated_at - interval '1 minute'
  );

-- BLOCK select_assessment_lock
SELECT
  1
FROM
  assessments AS a
WHERE
  a.id = $assessment_id FOR
UPDATE;

-- BLOCK select_assessment_needs_statisics_update
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessment_instances AS ai
    WHERE
      ai.assessment_id = a.id
      AND ai.modified_at > a.statistics_last_updated_at - interval '1 minute'
  ) AS needs_statistics_update
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK update_assessment_statisics
UPDATE assessments AS a
SET
  statistics_last_updated_at = now(),
  score_stat_number = score_stats.number,
  score_stat_min = score_stats.min,
  score_stat_max = score_stats.max,
  score_stat_mean = score_stats.mean,
  score_stat_std = score_stats.std,
  score_stat_median = score_stats.median,
  score_stat_n_zero = score_stats.n_zero,
  score_stat_n_hundred = score_stats.n_hundred,
  score_stat_n_zero_perc = score_stats.n_zero_perc,
  score_stat_n_hundred_perc = score_stats.n_hundred_perc,
  score_stat_hist = score_stats.score_hist,
  duration_stat_min = duration_stats.min,
  duration_stat_max = duration_stats.max,
  duration_stat_mean = duration_stats.mean,
  duration_stat_median = duration_stats.median,
  duration_stat_thresholds = duration_stats.thresholds,
  duration_stat_threshold_seconds = duration_stats.threshold_seconds,
  duration_stat_threshold_labels = duration_stats.threshold_labels,
  duration_stat_hist = duration_stats.hist
FROM
  assessments_score_stats ($assessment_id) AS score_stats,
  assessments_duration_stats ($assessment_id) AS duration_stats
WHERE
  a.id = $assessment_id;
