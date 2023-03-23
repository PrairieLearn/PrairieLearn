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
  a.id = $assessment_id
FOR UPDATE;

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

-- BLOCK assessment_instance_log
WITH
  ai_group_users AS (
    -- This selects not only all users who are currently in the group,
    -- but all users who were EVER in the group at some point. We've
    -- seen real-world examples of a user creating and joining a group,
    -- completing the assessment, and then leaving the group. If we
    -- didn't include past group members as well, we'd end up with an
    -- assessment log that didn't include any `page_view_logs` events,
    -- which would be undesirable for the instructor.
    SELECT
      gl.user_id
    FROM
      assessment_instances AS ai
      JOIN group_logs AS gl ON (gl.group_id = ai.group_id)
    WHERE
      ai.id = $assessment_instance_id
      AND gl.action = 'join'
  ),
  user_page_view_logs AS (
    SELECT
      pvl.*
    FROM
      page_view_logs AS pvl
      JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
    WHERE
      pvl.assessment_instance_id = $assessment_instance_id
      -- Include events for the assessment's owner and, in case of
      -- group assessments, for any user that at some point was part
      -- of the group.
      AND (
        pvl.authn_user_id = ai.user_id
        OR pvl.authn_user_id IN (
          SELECT
            *
          FROM
            ai_group_users
        )
      )
  ),
  event_log AS (
    (
      SELECT
        1 AS event_order,
        'Begin'::TEXT AS event_name,
        'gray3'::TEXT AS event_color,
        ai.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT AS qid,
        NULL::INTEGER AS question_id,
        NULL::INTEGER AS instance_question_id,
        NULL::INTEGER AS variant_id,
        NULL::INTEGER AS variant_number,
        NULL::INTEGER AS submission_id,
        NULL::BIGINT AS log_id,
        NULL::JSONB AS data
      FROM
        assessment_instances AS ai
        LEFT JOIN users AS u ON (u.user_id = ai.auth_user_id)
      WHERE
        ai.id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        2 AS event_order,
        'New variant'::TEXT AS event_name,
        'gray1'::TEXT AS event_color,
        v.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid AS qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::INTEGER AS submission_id,
        v.id AS log_id,
        jsonb_build_object(
          'variant_seed',
          v.variant_seed,
          'params',
          v.params,
          'true_answer',
          v.true_answer,
          'options',
          v.options
        ) AS data
      FROM
        variants AS v
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.user_id = v.authn_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        3 AS event_order,
        'Submission'::TEXT AS event_name,
        'blue3'::TEXT AS event_color,
        s.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        s.id AS submission_id,
        s.id AS log_id,
        jsonb_build_object(
          'submitted_answer',
          CASE
            WHEN $include_files THEN s.submitted_answer
            ELSE (s.submitted_answer - '_files')
          END,
          'raw_submitted_answer',
          CASE
            WHEN $include_files THEN s.raw_submitted_answer
            -- Elements that produce files (upload, editor, etc.) will use keys like '_file_upload_XXX' or equivalent
            ELSE (
              SELECT
                JSONB_OBJECT_AGG(key, value)
              FROM
                JSONB_EACH(s.raw_submitted_answer)
              WHERE
                NOT STARTS_WITH(key, '_')
            )
          END,
          'correct',
          s.correct
        ) AS data
      FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        3.5 AS event_order,
        'External grading results'::TEXT AS event_name,
        'blue1'::TEXT AS event_color,
        gj.graded_at AS date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        to_jsonb(gj.*) AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND gj.grading_method = 'External'
        AND gj.graded_at IS NOT NULL
    )
    UNION
    (
      SELECT
        3.7 AS event_order,
        'Manual grading results'::TEXT AS event_name,
        'blue2'::TEXT AS event_color,
        gj.graded_at AS date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        jsonb_build_object(
          'correct',
          gj.correct,
          'score',
          gj.score,
          'manual_points',
          gj.manual_points,
          'auto_points',
          gj.auto_points,
          'feedback',
          gj.feedback,
          'submitted_answer',
          CASE
            WHEN $include_files THEN s.submitted_answer
            ELSE (s.submitted_answer - '_files')
          END,
          'submission_id',
          s.id
        ) AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND gj.grading_method = 'Manual'
        AND gj.graded_at IS NOT NULL
    )
    UNION
    (
      SELECT
        4 AS event_order,
        'Grade submission'::TEXT AS event_name,
        'orange3'::TEXT AS event_color,
        gj.graded_at AS date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        jsonb_build_object(
          'correct',
          gj.correct,
          'score',
          gj.score,
          'feedback',
          gj.feedback,
          'submitted_answer',
          CASE
            WHEN $include_files THEN s.submitted_answer
            ELSE (s.submitted_answer - '_files')
          END,
          'true_answer',
          v.true_answer
        ) AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND gj.grading_method = 'Internal'
        AND gj.graded_at IS NOT NULL
    )
    UNION
    (
      SELECT
        5 AS event_order,
        'Score question'::TEXT AS event_name,
        'brown1'::TEXT AS event_color,
        qsl.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::INTEGER AS submission_id,
        qsl.id AS log_id,
        jsonb_build_object(
          'points',
          qsl.points,
          'max_points',
          qsl.max_points,
          'score_perc',
          qsl.score_perc,
          'correct',
          s.correct
        ) AS data
      FROM
        question_score_logs AS qsl
        JOIN instance_questions AS iq ON (iq.id = qsl.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.user_id = qsl.auth_user_id)
        LEFT JOIN grading_jobs AS gj ON (gj.id = qsl.grading_job_id)
        LEFT JOIN submissions AS s ON (s.id = gj.submission_id)
        LEFT JOIN variants AS v ON (v.id = s.variant_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        6 AS event_order,
        'Score assessment'::TEXT AS event_name,
        'brown3'::TEXT AS event_color,
        asl.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT AS qid,
        NULL::INTEGER AS question_id,
        NULL::INTEGER AS instance_question_id,
        NULL::INTEGER AS variant_id,
        NULL::INTEGER AS variant_number,
        NULL::INTEGER AS submission_id,
        asl.id AS log_id,
        jsonb_build_object(
          'points',
          asl.points,
          'max_points',
          asl.max_points,
          'score_perc',
          asl.score_perc
        ) AS data
      FROM
        assessment_score_logs AS asl
        LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
      WHERE
        asl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        7 AS event_order,
        CASE
          WHEN asl.open THEN 'Open'::TEXT
          ELSE 'Close'::TEXT
        END AS event_name,
        'gray3'::TEXT AS event_color,
        asl.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT AS qid,
        NULL::INTEGER AS question_id,
        NULL::INTEGER AS instance_question_id,
        NULL::INTEGER AS variant_id,
        NULL::INTEGER AS variant_number,
        NULL::INTEGER AS submission_id,
        asl.id AS log_id,
        CASE
          WHEN asl.open THEN jsonb_build_object(
            'date_limit',
            CASE
              WHEN asl.date_limit IS NULL THEN 'Unlimited'
              ELSE format_date_full_compact (asl.date_limit, ci.display_timezone)
            END,
            'time_limit',
            CASE
              WHEN asl.date_limit IS NULL THEN 'Unlimited'
              ELSE format_interval (asl.date_limit - ai.date)
            END,
            'remaining_time',
            CASE
              WHEN asl.date_limit IS NULL THEN 'Unlimited'
              ELSE format_interval (asl.date_limit - asl.date)
            END
          )
          ELSE NULL::JSONB
        END AS data
      FROM
        assessment_state_logs AS asl
        JOIN assessment_instances AS ai ON (ai.id = $assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
      WHERE
        asl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        7.5 AS event_order,
        'Time limit expiry'::TEXT AS event_name,
        'red2'::TEXT AS event_color,
        asl.date_limit AS date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT AS qid,
        NULL::INTEGER AS question_id,
        NULL::INTEGER AS instance_question_id,
        NULL::INTEGER AS variant_id,
        NULL::INTEGER AS variant_number,
        NULL::INTEGER AS submission_id,
        asl.id AS log_id,
        jsonb_build_object(
          'time_limit',
          format_interval (asl.date_limit - ai.date)
        ) AS data
      FROM
        assessment_state_logs AS asl
        JOIN assessment_instances AS ai ON (ai.id = $assessment_instance_id)
        LEFT JOIN users AS u ON (u.user_id = asl.auth_user_id)
      WHERE
        asl.assessment_instance_id = $assessment_instance_id
        AND asl.open
        AND asl.date_limit IS NOT NULL
        -- Only list as expired if it already happened
        AND asl.date_limit < CURRENT_TIMESTAMP
        -- Only list the expiry date if the assessment was
        -- not closed or extended after this time limit
        -- was set but before it expired
        AND NOT EXISTS (
          SELECT
            1
          FROM
            assessment_state_logs aslc
          WHERE
            aslc.assessment_instance_id = $assessment_instance_id
            AND aslc.date > asl.date
            AND aslc.date <= asl.date_limit
        )
    )
    UNION
    (
      SELECT
        8 AS event_order,
        'View variant'::TEXT AS event_name,
        'green3'::TEXT AS event_color,
        pvl.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid AS qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::INTEGER AS submission_id,
        pvl.id AS log_id,
        NULL::JSONB AS data
      FROM
        user_page_view_logs AS pvl
        JOIN variants AS v ON (v.id = pvl.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN questions AS q ON (q.id = pvl.question_id)
        JOIN users AS u ON (u.user_id = pvl.authn_user_id)
        JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
      WHERE
        pvl.page_type = 'studentInstanceQuestion'
    )
    UNION
    (
      SELECT
        9 AS event_order,
        'View assessment overview'::TEXT AS event_name,
        'green1'::TEXT AS event_color,
        pvl.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT AS qid,
        NULL::INTEGER AS question_id,
        NULL::INTEGER AS instance_question_id,
        NULL::INTEGER AS variant_id,
        NULL::INTEGER AS variant_number,
        NULL::INTEGER AS submission_id,
        pvl.id AS log_id,
        NULL::JSONB AS data
      FROM
        user_page_view_logs AS pvl
        JOIN users AS u ON (u.user_id = pvl.authn_user_id)
        JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
      WHERE
        pvl.page_type = 'studentAssessmentInstance'
    )
    UNION
    (
      SELECT
        10 AS event_order,
        ('Group ' || gl.action)::TEXT AS event_name,
        'gray2'::TEXT AS event_color,
        gl.date,
        u.user_id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::TEXT AS qid,
        NULL::INTEGER AS question_id,
        NULL::INTEGER AS instance_question_id,
        NULL::INTEGER AS variant_id,
        NULL::INTEGER AS variant_number,
        NULL::INTEGER AS submission_id,
        gl.id AS log_id,
        jsonb_build_object('user', gu.uid) AS data
      FROM
        assessment_instances AS ai
        JOIN group_logs AS gl ON (gl.group_id = ai.group_id)
        JOIN users AS u ON (u.user_id = gl.authn_user_id)
        LEFT JOIN users AS gu ON (gu.user_id = gl.user_id)
      WHERE
        ai.id = $assessment_instance_id
    )
    ORDER BY
      date,
      event_order,
      log_id,
      question_id
  ),
  question_data AS (
    SELECT
      iq.id AS instance_question_id,
      qo.question_number AS student_question_number,
      admin_assessment_question_number (aq.id) AS instructor_question_number
    FROM
      instance_questions AS iq
      JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN question_order (ai.id) AS qo ON (qo.instance_question_id = iq.id)
    WHERE
      ai.id = $assessment_instance_id
  )
SELECT
  el.event_name,
  el.event_color,
  el.date AS event_date,
  el.auth_user_uid,
  el.qid,
  el.question_id,
  el.instance_question_id,
  el.variant_id,
  el.variant_number,
  el.submission_id,
  el.data,
  format_date_full_compact (el.date, ci.display_timezone) AS formatted_date,
  format_date_iso8601 (el.date, ci.display_timezone) AS date_iso8601,
  qd.student_question_number,
  qd.instructor_question_number
FROM
  event_log AS el
  LEFT JOIN question_data AS qd ON (qd.instance_question_id = el.instance_question_id),
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  ai.id = $assessment_instance_id;
