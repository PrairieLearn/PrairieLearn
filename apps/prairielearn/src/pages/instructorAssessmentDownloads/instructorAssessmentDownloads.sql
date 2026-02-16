-- BLOCK select_assessment_instances
WITH
  filtered_assessment_instances AS (
    SELECT DISTINCT
      ON (
        CASE
          WHEN $group_work THEN ai.team_id
          ELSE u.id
        END,
        CASE
          WHEN $highest_score THEN NULL
          ELSE ai.id
        END
      ) (aset.name || ' ' || a.number) AS assessment_label,
      u.id,
      u.uid,
      u.uin,
      u.name,
      users_get_displayed_role (u.id, ci.id) AS role,
      substring(
        u.uid
        FROM
          '^[^@]+'
      ) AS username,
      ai.score_perc,
      ai.points,
      ai.max_points,
      ai.number,
      ai.id AS assessment_instance_id,
      ai.open,
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
      format_date_iso8601 (ai.date, ci.display_timezone) AS date_formatted,
      format_interval (ai.duration) AS duration,
      DATE_PART('epoch', ai.duration) AS duration_secs,
      DATE_PART('epoch', ai.duration) / 60 AS duration_mins,
      g.name AS group_name,
      teams_uid_list (g.id) AS uid_list
    FROM
      assessments AS a
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
      LEFT JOIN team_configs AS gc ON (gc.assessment_id = a.id)
      LEFT JOIN teams AS g ON (
        g.id = ai.team_id
        AND g.team_config_id = gc.id
      )
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
      JOIN users AS u ON (
        u.id = ai.user_id
        OR u.id = gu.user_id
      )
    WHERE
      a.id = $assessment_id
    ORDER BY
      CASE
        WHEN $group_work THEN ai.team_id
        ELSE u.id
      END,
      CASE
        WHEN $highest_score THEN NULL
        ELSE ai.id
      END,
      ai.score_perc DESC,
      ai.number DESC
  )
SELECT
  *
FROM
  filtered_assessment_instances
ORDER BY
  uid,
  group_name,
  uin,
  id,
  number,
  assessment_instance_id;

-- BLOCK select_instance_questions
SELECT
  u.uid,
  u.uin,
  u.name,
  users_get_displayed_role (u.id, ci.id) AS role,
  (aset.name || ' ' || a.number) AS assessment_label,
  ai.number AS assessment_instance_number,
  z.number AS zone_number,
  z.title AS zone_title,
  q.qid,
  iq.number AS instance_question_number,
  iq.points,
  iq.score_perc,
  iq.auto_points,
  iq.manual_points,
  aq.max_points,
  aq.max_auto_points,
  aq.max_manual_points,
  format_date_iso8601 (iq.created_at, ci.display_timezone) AS date_formatted,
  iq.highest_submission_score,
  iq.last_submission_score,
  iq.number_attempts,
  DATE_PART('epoch', iq.duration) AS duration_seconds,
  g.name AS group_name,
  teams_uid_list (g.id) AS uid_list,
  agu.uid AS assigned_grader,
  lgu.uid AS last_grader
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN team_configs AS gc ON (gc.assessment_id = a.id)
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.team_config_id = gc.id
  )
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  LEFT JOIN users AS agu ON (agu.id = iq.assigned_grader)
  LEFT JOIN users AS lgu ON (lgu.id = iq.last_grader)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
WHERE
  a.id = $assessment_id
ORDER BY
  u.uid,
  u.uin,
  group_name,
  ai.number,
  q.qid,
  iq.number,
  iq.id;

-- BLOCK submissions_for_manual_grading
WITH
  final_assessment_instances AS (
    SELECT DISTINCT
      ON (g.id, u.id) ai.id,
      u.id AS user_id,
      g.id AS group_id,
      assessment_id,
      g.name AS team_name,
      teams_uid_list (g.id) AS uid_list
    FROM
      assessment_instances AS ai
      LEFT JOIN teams AS g ON (g.id = ai.team_id)
      LEFT JOIN users AS u ON (u.id = ai.user_id)
    WHERE
      ai.assessment_id = $assessment_id
    ORDER BY
      g.id ASC,
      u.id ASC,
      ai.number DESC
  ),
  final_submissions AS (
    SELECT DISTINCT
      ON (ai.id, q.qid) u.uid,
      u.uin,
      z.number AS zone_number,
      z.title AS zone_title,
      q.qid,
      iq.score_perc AS old_score_perc,
      iq.auto_points AS old_auto_points,
      iq.manual_points AS old_manual_points,
      aq.max_points,
      aq.max_auto_points,
      aq.max_manual_points,
      s.feedback AS old_feedback,
      s.id AS submission_id,
      s.params,
      s.true_answer,
      CASE
        WHEN $include_files THEN s.submitted_answer
        ELSE (s.submitted_answer - '_files')
      END AS submitted_answer,
      s.partial_scores AS old_partial_scores,
      ai.team_name AS group_name,
      ai.uid_list
    FROM
      submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
      JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
      JOIN final_assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      LEFT JOIN users AS u ON (u.id = ai.user_id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN questions AS q ON (q.id = aq.question_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
    ORDER BY
      ai.id ASC,
      q.qid ASC,
      s.date DESC
  )
SELECT
  *
FROM
  final_submissions
ORDER BY
  uid,
  group_name,
  qid,
  submission_id;

-- BLOCK assessment_instance_submissions
WITH
  all_submissions AS (
    SELECT
      u.uid,
      u.uin,
      u.name,
      users_get_displayed_role (u.id, ci.id) AS role,
      (aset.name || ' ' || a.number) AS assessment_label,
      ai.number AS assessment_instance_number,
      z.number AS zone_number,
      z.title AS zone_title,
      q.qid,
      iq.number AS instance_question_number,
      iq.points,
      iq.score_perc,
      iq.auto_points,
      iq.manual_points,
      aq.max_points,
      aq.max_auto_points,
      aq.max_manual_points,
      v.number AS variant_number,
      v.variant_seed,
      s.params,
      s.true_answer,
      v.options,
      s.date,
      s.id AS submission_id,
      format_date_iso8601 (s.date, ci.display_timezone) AS submission_date_formatted,
      s.submitted_answer,
      s.partial_scores,
      s.override_score,
      s.credit,
      s.mode,
      format_date_iso8601 (s.grading_requested_at, ci.display_timezone) AS grading_requested_at_formatted,
      format_date_iso8601 (s.graded_at, ci.display_timezone) AS graded_at_formatted,
      s.score,
      CASE
        WHEN s.correct THEN 'TRUE'
        WHEN NOT s.correct THEN 'FALSE'
        ELSE NULL
      END AS correct,
      s.feedback,
      CASE
        WHEN rg.id IS NOT NULL THEN (
          SELECT
            JSONB_BUILD_OBJECT(
              'computed_points',
              rg.computed_points,
              'adjust_points',
              rg.adjust_points,
              'items',
              COALESCE(
                JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'description',
                    rgi.description,
                    'points',
                    rgi.points
                  )
                ),
                '[]'::jsonb
              )
            )
          FROM
            rubric_grading_items rgi
          WHERE
            rgi.rubric_grading_id = rg.id
        )
      END AS rubric_grading,
      row_number() OVER (
        PARTITION BY
          v.id
        ORDER BY
          s.date
      )::integer AS submission_number,
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
      ) = 1 AS best_submission_per_variant,
      g.name AS group_name,
      teams_uid_list (g.id) AS uid_list,
      su.uid AS submission_user,
      agu.uid AS assigned_grader,
      lgu.uid AS last_grader
    FROM
      assessments AS a
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
      LEFT JOIN team_configs AS gc ON (gc.assessment_id = a.id)
      LEFT JOIN teams AS g ON (
        g.id = ai.team_id
        AND g.team_config_id = gc.id
      )
      LEFT JOIN users AS u ON (u.id = ai.user_id)
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN questions AS q ON (q.id = aq.question_id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      LEFT JOIN users AS su ON (su.id = s.auth_user_id)
      LEFT JOIN users AS agu ON (agu.id = iq.assigned_grader)
      LEFT JOIN users AS lgu ON (lgu.id = iq.last_grader)
      LEFT JOIN rubric_gradings AS rg ON (rg.id = s.manual_rubric_grading_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
    WHERE
      a.id = $assessment_id
  )
SELECT
  *
FROM
  all_submissions
WHERE
  (
    $include_all
    OR (
      $include_final
      AND final_submission_per_variant
    )
    OR (
      $include_best
      AND best_submission_per_variant
    )
  )
ORDER BY
  uid,
  group_name,
  assessment_instance_number,
  qid,
  instance_question_number,
  variant_number,
  date;

-- BLOCK group_configs
SELECT
  g.name,
  u.uid,
  COALESCE(
    ARRAY_AGG(gr.role_name) FILTER (
      WHERE
        gr.role_name IS NOT NULL
    ),
    '{}'::text[]
  ) AS roles
FROM
  team_configs AS gc
  JOIN teams AS g ON gc.id = g.team_config_id
  JOIN team_users AS gu ON g.id = gu.team_id
  JOIN users AS u ON gu.user_id = u.id
  LEFT JOIN team_user_roles AS gur ON (
    gur.team_id = g.id
    AND gur.user_id = u.id
  )
  LEFT JOIN team_roles AS gr ON gur.team_role_id = gr.id
WHERE
  gc.assessment_id = $assessment_id
  AND gc.deleted_at IS NULL
  AND g.deleted_at IS NULL
GROUP BY
  g.name,
  u.uid
ORDER BY
  g.name,
  u.uid;
