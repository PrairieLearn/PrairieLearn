-- BLOCK select_assessments
SELECT
  a.id AS assessment_id,
  a.tid AS assessment_name,
  (aset.abbreviation || a.number) AS assessment_label,
  a.type,
  a.number AS assessment_number,
  a.order_by AS assessment_order_by,
  a.title,
  a.assessment_set_id,
  aset.abbreviation AS assessment_set_abbreviation,
  aset.name AS assessment_set_name,
  aset.number AS assessment_set_number,
  aset.heading AS assessment_set_heading,
  aset.color AS assessment_set_color
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
  AND (
    $unsafe_assessment_id::bigint IS NULL
    OR a.id = $unsafe_assessment_id
  )
ORDER BY
  assessment_set_number,
  assessment_order_by,
  assessment_id;

-- BLOCK select_assessment_instances
SELECT
  ai.id AS assessment_instance_id,
  a.id AS assessment_id,
  a.tid AS assessment_name,
  a.title AS assessment_title,
  (aset.abbreviation || a.number) AS assessment_label,
  aset.abbreviation AS assessment_set_abbreviation,
  a.number AS assessment_number,
  u.id AS user_id,
  u.uid AS user_uid,
  u.uin AS user_uin,
  u.name AS user_name,
  users_get_displayed_role (u.id, ci.id) AS user_role,
  ai.max_points,
  ai.max_bonus_points,
  ai.points,
  ai.score_perc,
  ai.number AS assessment_instance_number,
  ai.open,
  format_date_iso8601 (ai.modified_at, ci.display_timezone) AS modified_at,
  gi.id AS group_id,
  gi.name AS group_name,
  gi.uid_list AS group_uids,
  CASE
    WHEN ai.open
    AND ai.date_limit IS NOT NULL THEN greatest(
      0,
      floor(
        DATE_PART('epoch', (ai.date_limit - current_timestamp)) / 60
      )
    )::text || ' min'
    WHEN ai.open THEN 'Open'
    ELSE 'Closed'
  END AS time_remaining,
  format_date_iso8601 (ai.date, ci.display_timezone) AS start_date,
  DATE_PART('epoch', ai.duration) AS duration_seconds,
  (
    row_number() OVER (
      PARTITION BY
        u.id
      ORDER BY
        score_perc DESC NULLS LAST,
        ai.date DESC,
        ai.number DESC,
        ai.id DESC
    )
  ) = 1 AS highest_score
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  LEFT JOIN team_info (a.id) AS gi ON (gi.id = ai.team_id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
WHERE
  ci.id = $course_instance_id
  AND (
    $unsafe_assessment_id::bigint IS NULL
    OR a.id = $unsafe_assessment_id
  )
  AND (
    $unsafe_assessment_instance_id::bigint IS NULL
    OR ai.id = $unsafe_assessment_instance_id
  )
ORDER BY
  user_role DESC,
  user_uid ASC,
  user_id ASC,
  assessment_instance_number ASC,
  assessment_instance_id ASC;

-- BLOCK select_assessment_access_rules
SELECT
  a.id AS assessment_id,
  a.tid AS assessment_name,
  a.title AS assessment_title,
  (aset.abbreviation || a.number) AS assessment_label,
  aset.abbreviation AS assessment_set_abbreviation,
  a.number AS assessment_number,
  aar.credit,
  format_date_iso8601 (aar.end_date, ci.display_timezone) AS end_date,
  aar.exam_uuid,
  aar.id AS assessment_access_rule_id,
  aar.mode,
  aar.number AS assessment_access_rule_number,
  aar.password,
  aar.show_closed_assessment,
  aar.show_closed_assessment_score,
  format_date_iso8601 (aar.start_date, ci.display_timezone) AS start_date,
  aar.time_limit_min,
  aar.uids
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN assessment_access_rules AS aar ON (aar.assessment_id = a.id)
WHERE
  ci.id = $course_instance_id
  AND a.id = $unsafe_assessment_id
ORDER BY
  assessment_access_rule_number,
  assessment_access_rule_id;

-- BLOCK select_course_instance_info
SELECT
  ci.id AS course_instance_id,
  ci.long_name AS course_instance_long_name,
  ci.short_name AS course_instance_short_name,
  ci.course_id AS course_instance_course_id,
  ci.display_timezone,
  format_date_iso8601 (ci.deleted_at, ci.display_timezone) AS deleted_at,
  pl_c.title AS course_title,
  pl_c.short_name AS course_short_name
FROM
  course_instances AS ci
  JOIN courses AS pl_c ON (pl_c.id = ci.course_id)
WHERE
  ci.id = $course_instance_id;

-- BLOCK select_course_instance_access_rules
SELECT
  ci.id AS course_instance_id,
  ci.short_name AS course_instance_short_name,
  ci.long_name AS course_instance_long_name,
  ci.course_id AS course_instance_course_id,
  format_date_iso8601 (ciar.end_date, ci.display_timezone) AS end_date,
  ciar.id AS course_instance_access_rule_id,
  ciar.institution,
  ciar.number AS course_instance_access_rule_number,
  format_date_iso8601 (ciar.start_date, ci.display_timezone) AS start_date,
  ciar.uids
FROM
  course_instances AS ci
  JOIN course_instance_access_rules AS ciar ON (ciar.course_instance_id = ci.id)
WHERE
  ci.id = $course_instance_id
ORDER BY
  course_instance_access_rule_number,
  course_instance_access_rule_id;

-- BLOCK select_instance_questions
SELECT
  z.number AS zone_number,
  z.title AS zone_title,
  q.id AS question_id,
  q.qid AS question_name,
  iq.id AS instance_question_id,
  iq.number AS instance_question_number,
  aq.max_points AS assessment_question_max_points,
  aq.max_auto_points AS assessment_question_max_auto_points,
  aq.max_manual_points AS assessment_question_max_manual_points,
  iq.points AS instance_question_points,
  iq.auto_points AS instance_question_auto_points,
  iq.manual_points AS instance_question_manual_points,
  iq.score_perc AS instance_question_score_perc,
  iq.highest_submission_score,
  iq.last_submission_score,
  iq.number_attempts,
  DATE_PART('epoch', iq.duration) AS duration_seconds
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
WHERE
  ai.id = $unsafe_assessment_instance_id
  AND ci.id = $course_instance_id
ORDER BY
  instance_question_id;

-- BLOCK select_submissions
SELECT
  s.id AS submission_id,
  u.id AS user_id,
  u.uid AS user_uid,
  u.uin AS user_uin,
  u.name AS user_name,
  users_get_displayed_role (u.id, ci.id) AS user_role,
  gi.id AS group_id,
  gi.name AS group_name,
  gi.uid_list AS group_uids,
  a.id AS assessment_id,
  a.tid AS assessment_name,
  (aset.abbreviation || a.number) AS assessment_label,
  ai.id AS assessment_instance_id,
  ai.number AS assessment_instance_number,
  q.id AS question_id,
  q.qid AS question_name,
  top.name AS question_topic,
  (
    SELECT
      COALESCE(JSONB_AGG(tg.name), '[]'::jsonb) AS tags
    FROM
      question_tags AS qt
      JOIN tags AS tg ON (tg.id = qt.tag_id)
    WHERE
      q.id = qt.question_id
  ) AS question_tags,
  iq.id AS instance_question_id,
  iq.number AS instance_question_number,
  aq.max_points AS assessment_question_max_points,
  aq.max_auto_points AS assessment_question_max_auto_points,
  aq.max_manual_points AS assessment_question_max_manual_points,
  iq.points AS instance_question_points,
  iq.auto_points AS instance_question_auto_points,
  iq.manual_points AS instance_question_manual_points,
  iq.score_perc AS instance_question_score_perc,
  v.id AS variant_id,
  v.number AS variant_number,
  v.variant_seed,
  s.params,
  s.true_answer,
  v.options,
  format_date_iso8601 (s.date, ci.display_timezone) AS date,
  s.submitted_answer,
  s.partial_scores,
  s.override_score,
  s.credit,
  s.mode,
  format_date_iso8601 (s.grading_requested_at, ci.display_timezone) AS grading_requested_at,
  format_date_iso8601 (s.graded_at, ci.display_timezone) AS graded_at,
  s.score,
  s.correct,
  s.feedback,
  rg.computed_points AS rubric_grading_computed_points,
  rg.adjust_points AS rubric_grading_adjust_points,
  (
    SELECT
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'rubric_item_id',
          rgi.rubric_item_id,
          'text',
          rgi.description,
          'points',
          rgi.points
        )
      )
    FROM
      rubric_grading_items rgi
    WHERE
      rgi.rubric_grading_id = rg.id
  ) AS rubric_grading_items,
  (
    row_number() OVER (
      PARTITION BY
        v.id
      ORDER BY
        s.date DESC,
        s.id DESC
    )
  ) = 1 AS final_submission_per_variant,
  (
    row_number() OVER (
      PARTITION BY
        v.id
      ORDER BY
        s.score DESC NULLS LAST,
        s.date DESC,
        s.id DESC
    )
  ) = 1 AS best_submission_per_variant
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  LEFT JOIN team_info (a.id) AS gi ON (gi.id = ai.team_id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN topics AS top ON (top.id = q.topic_id)
  JOIN variants AS v ON (v.instance_question_id = iq.id)
  JOIN submissions AS s ON (s.variant_id = v.id)
  LEFT JOIN rubric_gradings AS rg ON (rg.id = s.manual_rubric_grading_id)
WHERE
  ci.id = $course_instance_id
  AND (
    $unsafe_assessment_instance_id::bigint IS NULL
    OR ai.id = $unsafe_assessment_instance_id
  )
  AND (
    $unsafe_submission_id::bigint IS NULL
    OR s.id = $unsafe_submission_id
  )
ORDER BY
  assessment_instance_number,
  question_name,
  instance_question_number,
  variant_number,
  date,
  submission_id;

-- BLOCK select_assessment_instance
SELECT
  ai.id AS assessment_instance_id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  ai.id = $unsafe_assessment_instance_id
  AND ci.id = $course_instance_id;
