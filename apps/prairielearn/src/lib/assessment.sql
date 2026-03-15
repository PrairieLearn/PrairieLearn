-- BLOCK check_belongs
SELECT
  ai.id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.id = $assessment_instance_id
  AND a.id = $assessment_id;

-- BLOCK insert_assessment_instance
WITH
  latest_assessment_instance AS (
    SELECT
      ai.*
    FROM
      assessment_instances AS ai
    WHERE
      ai.assessment_id = $assessment_id
      AND (
        CASE
          WHEN $group_id::bigint IS NOT NULL THEN ai.team_id = $group_id
          ELSE ai.user_id = $user_id
        END
      )
    ORDER BY
      ai.number DESC
    LIMIT
      1
  ),
  inserted_assessment_instance AS (
    INSERT INTO
      assessment_instances (
        auth_user_id,
        assessment_id,
        user_id,
        team_id,
        mode,
        auto_close,
        date_limit,
        number,
        include_in_statistics,
        last_client_fingerprint_id
      )
    SELECT
      $authn_user_id,
      $assessment_id,
      CASE
        WHEN $group_id::bigint IS NULL THEN $user_id
      END,
      $group_id,
      $mode,
      a.auto_close
      AND a.type = 'Exam',
      CASE
        WHEN $time_limit_min::integer IS NOT NULL THEN $date::timestamptz + make_interval(mins => $time_limit_min)
      END,
      COALESCE(lai.number, 0) + 1,
      NOT users_is_instructor_in_course_instance ($user_id, a.course_instance_id),
      $client_fingerprint_id
    FROM
      assessments AS a
      -- Only retrieve the latest assessment instance if the assessment allows
      -- multiple instances, otherwise trigger a conflict on number.
      LEFT JOIN latest_assessment_instance AS lai ON a.multiple_instance
    WHERE
      a.id = $assessment_id
    ON CONFLICT DO NOTHING
    RETURNING
      *
  ),
  inserted_assessment_state_log AS (
    INSERT INTO
      assessment_state_logs (
        open,
        assessment_instance_id,
        date_limit,
        auth_user_id,
        client_fingerprint_id
      )
    SELECT
      ai.open,
      ai.id,
      ai.date_limit,
      $authn_user_id,
      $client_fingerprint_id
    FROM
      inserted_assessment_instance AS ai
  ),
  -- Use separate CTEs for last_access because Postgres does not support
  -- multiple ON CONFLICT clauses in a single INSERT statement. Only one of
  -- these CTEs will actually insert a row.
  inserted_last_access_group AS (
    INSERT INTO
      last_accesses (team_id, last_access)
    SELECT
      $group_id,
      current_timestamp
    WHERE
      $group_id::bigint IS NOT NULL
    ON CONFLICT (team_id) DO UPDATE
    SET
      last_access = EXCLUDED.last_access
  ),
  inserted_last_access_non_group AS (
    INSERT INTO
      last_accesses (user_id, last_access)
    SELECT
      $user_id,
      current_timestamp
    WHERE
      $group_id::bigint IS NULL
    ON CONFLICT (user_id) DO UPDATE
    SET
      last_access = EXCLUDED.last_access
  )
SELECT
  id AS assessment_instance_id,
  TRUE AS created
FROM
  inserted_assessment_instance
UNION ALL
-- If the assessment instance was not inserted because of a conflict on number, return the existing assessment instance.
SELECT
  id AS assessment_instance_id,
  FALSE AS created
FROM
  latest_assessment_instance
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      inserted_assessment_instance
  );

-- BLOCK insert_instance_questions
WITH
  existing_instance_questions AS (
    SELECT
      *
    FROM
      instance_questions
    WHERE
      assessment_instance_id IS NOT DISTINCT FROM $assessment_instance_id
  ),
  -- First assign two random orderings to the list of questions, one for
  -- alternative_group question selection and one for zone question
  -- selection, plus a fixed ordering based on the existing question
  -- number (if any).
  randomized_assessment_questions AS (
    SELECT
      aq.*,
      CASE
        WHEN iq.id IS NOT NULL THEN 1
        ELSE 2
      END AS existing_order,
      random() AS ag_rand, -- for alternative_group selection
      random() AS z_rand -- for zone selection
    FROM
      assessment_questions AS aq
      LEFT JOIN existing_instance_questions AS iq ON (iq.assessment_question_id = aq.id)
    WHERE
      aq.assessment_id = $assessment_id
      AND aq.deleted_at IS NULL
  ),
  -- Next choose subsets of each alternative_group with the correct
  -- number of questions, or all of them if number_choose isn't
  -- specified for that alternative_group.
  --
  -- To do this, we start by sorting the questions within each
  -- alternative_group by the ag_rand value.
  ag_numbered_assessment_questions AS (
    SELECT
      aq.*,
      (
        row_number() OVER (
          PARTITION BY
            aq.alternative_group_id
          ORDER BY
            aq.existing_order,
            aq.ag_rand,
            aq.id
        )
      ) AS ag_row_number
    FROM
      randomized_assessment_questions AS aq
  ),
  -- Now we actually choose the questions in each alternative_group.
  ag_chosen_assessment_questions AS (
    SELECT
      aq.*
    FROM
      ag_numbered_assessment_questions AS aq
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    WHERE
      (ag.number_choose IS NULL)
      OR (ag_row_number <= ag.number_choose)
  ),
  -- Next we choose subsets of questions in each zone (or all of them
  -- if number_choose isn't specified for the zone).
  --
  -- We start by sorting the questions within each zone, similarly to
  -- what we did above for each alternative_group. A key difference
  -- is that we first sort by the ag_row_number and then by z_rand.
  -- This means that all the questions with ag_row_number = 1 will be
  -- used up first, then all the ones with ag_row_number = 2, etc.
  -- This has the effect of spreading out our choices among the
  -- different alternative_groups in the zone as much as possible.
  z_numbered_assessment_questions AS (
    SELECT
      aq.*,
      (
        row_number() OVER (
          PARTITION BY
            z.id
          ORDER BY
            aq.ag_row_number,
            aq.existing_order,
            aq.z_rand,
            aq.id
        )
      ) AS z_row_number
    FROM
      ag_chosen_assessment_questions AS aq
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
  ),
  -- Now we actually select the questions within the zone.
  z_chosen_assessment_questions AS (
    SELECT
      aq.*
    FROM
      z_numbered_assessment_questions AS aq
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
      JOIN questions AS q ON (q.id = aq.question_id)
    WHERE
      (
        z.number_choose IS NULL
        OR z_row_number <= z.number_choose
      )
      AND q.deleted_at IS NULL
  ),
  inserted_instance_questions AS (
    INSERT INTO
      instance_questions AS iq (
        authn_user_id,
        assessment_instance_id,
        assessment_question_id,
        current_value,
        points_list,
        points_list_original,
        auto_points,
        manual_points
      )
    SELECT
      $authn_user_id,
      $assessment_instance_id,
      aq.id,
      coalesce(aq.init_points, aq.points_list[1], 0),
      aq.points_list,
      aq.points_list AS points_list_original,
      0,
      0 -- These points are updated manually because their default value is set to NULL for migration purposes
    FROM
      z_chosen_assessment_questions AS aq
    ON CONFLICT (assessment_question_id, assessment_instance_id) DO NOTHING
    RETURNING
      iq.*
  ),
  inserted_audit_logs AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        course_id,
        user_id,
        team_id,
        table_name,
        row_id,
        action,
        new_state
      )
    SELECT
      $authn_user_id,
      ci.course_id,
      ai.user_id,
      ai.team_id,
      'instance_questions',
      iq.id,
      'insert',
      to_jsonb(iq.*)
    FROM
      inserted_instance_questions AS iq
      JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  )
SELECT
  iq.id
FROM
  inserted_instance_questions AS iq;

-- BLOCK update_assessment_instance_max_points
WITH
  new_max_points AS (
    SELECT
      ai.max_points AS old_max_points,
      ai.max_bonus_points AS old_max_bonus_points,
      COALESCE(
        a.max_points,
        GREATEST(
          $total_points_zones - COALESCE(a.max_bonus_points, 0),
          0
        )
      ) AS new_max_points,
      COALESCE(a.max_bonus_points, 0) AS new_max_bonus_points
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
      ai.id = $assessment_instance_id
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      max_points = nmp.new_max_points,
      max_bonus_points = nmp.new_max_bonus_points,
      modified_at = now()
    FROM
      new_max_points AS nmp
    WHERE
      ai.id = $assessment_instance_id
      AND (
        nmp.new_max_points IS DISTINCT FROM ai.max_points
        OR nmp.new_max_bonus_points IS DISTINCT FROM ai.max_bonus_points
      )
    RETURNING
      ai.*,
      nmp.old_max_points,
      nmp.old_max_bonus_points
  ),
  inserted_audit_logs AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        course_id,
        user_id,
        team_id,
        table_name,
        column_name,
        row_id,
        action,
        old_state,
        new_state
      )
    SELECT
      $authn_user_id,
      ci.course_id,
      ai.user_id,
      ai.team_id,
      'assessment_instances',
      'max_points',
      ai.id,
      'update',
      jsonb_build_object(
        'max_points',
        ai.old_max_points,
        'max_bonus_points',
        ai.old_max_bonus_points
      ),
      jsonb_build_object(
        'max_points',
        ai.max_points,
        'max_bonus_points',
        ai.max_bonus_points
      )
    FROM
      updated_assessment_instance AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  )
SELECT
  max_points,
  max_bonus_points
FROM
  updated_assessment_instance;

-- BLOCK select_instances_to_grade
SELECT
  ai.id AS assessment_instance_id,
  ai.number AS instance_number,
  COALESCE(u.uid, 'group ' || g.name) AS username
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN users AS u ON (u.id = ai.user_id)
WHERE
  a.id = $assessment_id
  AND ai.open;

-- BLOCK close_assessment_instance
WITH
  all_dates AS (
    (
      SELECT
        ai.date
      FROM
        assessment_instances AS ai
      WHERE
        ai.id = $assessment_instance_id
    )
    UNION ALL
    (
      SELECT
        s.date
      FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
    )
  ),
  all_gaps AS (
    SELECT
      date - lag(date) OVER (
        ORDER BY
          date
      ) AS gap
    FROM
      all_dates
  ),
  total_gap AS (
    SELECT
      sum(gap) AS duration
    FROM
      all_gaps
      JOIN assessment_instances AS ai ON (ai.id = $assessment_instance_id)
      JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
      a.type != 'Homework'
      OR gap < '1 hour'::interval
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      open = FALSE,
      closed_at = CURRENT_TIMESTAMP,
      duration = COALESCE(
        (
          SELECT
            duration
          FROM
            total_gap
        ),
        '0 seconds'::interval
      ),
      modified_at = now(),
      -- Mark the assessment instance as in need of grading. We'll start
      -- grading immediately, but in case the PrairieLearn process dies in
      -- the middle of grading, the `autoFinishExams` cronjob will grade the
      -- assessment instance at some point in the near future.
      grading_needed = TRUE
    WHERE
      ai.id = $assessment_instance_id
    RETURNING
      ai.id
  )
INSERT INTO
  assessment_state_logs (
    open,
    assessment_instance_id,
    auth_user_id,
    client_fingerprint_id
  )
SELECT
  FALSE,
  updated_assessment_instance.id,
  $authn_user_id,
  $client_fingerprint_id
FROM
  updated_assessment_instance;

-- BLOCK cross_lockpoint
INSERT INTO
  assessment_instance_crossed_lockpoints (assessment_instance_id, zone_id, authn_user_id)
SELECT
  $assessment_instance_id,
  z.id,
  $authn_user_id
FROM
  zones AS z
  JOIN assessment_instances AS ai ON (ai.id = $assessment_instance_id)
WHERE
  z.id = $zone_id
  AND ai.open = TRUE
  AND z.lockpoint = TRUE
  AND z.assessment_id = ai.assessment_id
  -- All earlier lockpoints must already be crossed (sequential enforcement).
  AND NOT EXISTS (
    SELECT
      1
    FROM
      zones AS z2
      LEFT JOIN assessment_instance_crossed_lockpoints AS aicl ON (
        aicl.zone_id = z2.id
        AND aicl.assessment_instance_id = $assessment_instance_id
      )
    WHERE
      z2.assessment_id = z.assessment_id
      AND z2.lockpoint = TRUE
      AND z2.number < z.number
      AND aicl.id IS NULL
  )
  -- No questions in prior zones have an unmet advanceScorePerc threshold.
  -- We check the source (locking flag) rather than the downstream effect
  -- (blocked_sequence), because blocked_sequence can propagate into the
  -- lockpoint zone itself when advanceScorePerc is on the last question
  -- of the preceding zone.
  AND NOT EXISTS (
    SELECT
      1
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS prior_zone ON (prior_zone.id = ag.zone_id)
    WHERE
      iq.assessment_instance_id = $assessment_instance_id
      AND aq.deleted_at IS NULL
      AND prior_zone.assessment_id = z.assessment_id
      AND prior_zone.number < z.number
      AND aq.effective_advance_score_perc IS NOT NULL
      AND iq.open = TRUE
      AND 100 * COALESCE(iq.highest_submission_score, 0) < aq.effective_advance_score_perc
  )
ON CONFLICT (assessment_instance_id, zone_id) DO NOTHING
RETURNING
  id;

-- BLOCK check_lockpoint_crossed
SELECT
  id
FROM
  assessment_instance_crossed_lockpoints
WHERE
  assessment_instance_id = $assessment_instance_id
  AND zone_id = $zone_id;

-- BLOCK select_variants_for_assessment_instance_grading
SELECT DISTINCT
  ON (iq.id) to_jsonb(v.*) AS variant,
  to_jsonb(q.*) AS question,
  to_jsonb(vc.*) AS variant_course
FROM
  variants AS v
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN courses AS vc ON (vc.id = v.course_id)
WHERE
  ai.id = $assessment_instance_id
ORDER BY
  iq.id ASC,
  v.date DESC;

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
FOR NO KEY UPDATE;

-- BLOCK select_assessment_needs_statistics_update
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

-- BLOCK update_assessment_statistics
WITH
  student_assessment_scores AS (
    SELECT
      -- if a student has multiple assessment_instances for this assessment
      -- then use their maximum score
      max(ai.score_perc) AS score_perc
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      -- Only select groups that are not soft-deleted
      LEFT JOIN teams AS g ON (
        g.id = ai.team_id
        AND g.deleted_at IS NULL
      )
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
      JOIN users AS u ON (u.id = COALESCE(ai.user_id, gu.user_id))
      JOIN enrollments AS e ON (
        e.user_id = u.id
        AND e.course_instance_id = a.course_instance_id
      )
    WHERE
      a.id = $assessment_id
      AND ai.include_in_statistics
    GROUP BY
      u.id
  ),
  score_stats AS (
    SELECT
      count(score_perc) AS number,
      coalesce(min(score_perc), 0) AS min,
      coalesce(max(score_perc), 0) AS max,
      coalesce(avg(score_perc), 0) AS mean,
      coalesce(stddev_samp(score_perc), 0) AS std,
      coalesce(
        percentile_disc(0.5) WITHIN GROUP (
          ORDER BY
            score_perc
        ),
        0
      ) AS median,
      count(
        score_perc <= 0
        OR NULL
      ) AS n_zero,
      count(
        score_perc >= 100
        OR NULL
      ) AS n_hundred,
      CAST(
        count(
          score_perc <= 0
          OR NULL
        ) AS double precision
      ) / greatest(1, count(score_perc)) * 100 AS n_zero_perc,
      CAST(
        count(
          score_perc >= 100
          OR NULL
        ) AS double precision
      ) / greatest(1, count(score_perc)) * 100 AS n_hundred_perc,
      coalesce(
        histogram (score_perc, 0, 100, 10),
        array_fill(0, ARRAY[10])
      ) AS score_hist
    FROM
      student_assessment_scores
  ),
  basic_duration_stats AS (
    SELECT
      coalesce(min(duration), interval '0') AS min,
      coalesce(max(duration), interval '0') AS max,
      coalesce(avg(duration), interval '0') AS mean,
      coalesce(
        percentile_disc(0.5) WITHIN GROUP (
          ORDER BY
            duration
        ),
        interval '0'
      ) AS median,
      coalesce(
        percentile_disc(0.75) WITHIN GROUP (
          ORDER BY
            duration
        ),
        interval '0'
      ) AS quartile3,
      coalesce(
        percentile_disc(0.9) WITHIN GROUP (
          ORDER BY
            duration
        ),
        interval '0'
      ) AS perc90
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      -- Only select groups that are not soft-deleted
      LEFT JOIN teams AS g ON (
        g.id = ai.team_id
        AND g.deleted_at IS NULL
      )
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
      JOIN users AS u ON (u.id = COALESCE(ai.user_id, gu.user_id))
      JOIN enrollments AS e ON (
        e.user_id = u.id
        AND e.course_instance_id = a.course_instance_id
      )
    WHERE
      a.id = $assessment_id
      AND ai.include_in_statistics
  ),
  duration_stats AS (
    SELECT
      *,
      interval_hist_thresholds (
        coalesce(
          greatest(quartile3 + 2 * (quartile3 - median), perc90),
          interval '10 minutes'
        )
      ) AS thresholds
    FROM
      basic_duration_stats
  ),
  duration_hist_stats AS (
    SELECT
      coalesce(
        array_histogram (
          ai.duration,
          (
            SELECT
              thresholds
            FROM
              duration_stats
          )
        ),
        array_fill(
          0,
          ARRAY[
            array_length(
              (
                SELECT
                  thresholds
                FROM
                  duration_stats
              ),
              1
            ) - 1
          ]
        )
      ) AS hist
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      -- Only select groups that are not soft-deleted
      LEFT JOIN teams AS g ON (
        g.id = ai.team_id
        AND g.deleted_at IS NULL
      )
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
      JOIN users AS u ON (u.id = COALESCE(ai.user_id, gu.user_id))
      JOIN enrollments AS e ON (
        e.user_id = u.id
        AND e.course_instance_id = a.course_instance_id
      )
    WHERE
      a.id = $assessment_id
      AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
  )
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
  duration_stat_hist = duration_hist_stats.hist
FROM
  score_stats,
  duration_stats,
  duration_hist_stats
WHERE
  a.id = $assessment_id;

-- BLOCK select_and_lock_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK update_assessment_instance_score
WITH
  cleared_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      requires_manual_grading = FALSE
    WHERE
      iq.assessment_instance_id = $assessment_instance_id
      AND iq.requires_manual_grading = TRUE
  ),
  updated_assessment_instances AS (
    UPDATE assessment_instances AS ai
    SET
      points = $points,
      score_perc = $score_perc,
      score_perc_pending = 0,
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
  updated_assessment_instances AS ai;

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
      JOIN team_logs AS gl ON (gl.team_id = ai.team_id)
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
        'Begin'::text AS event_name,
        'gray3'::text AS event_color,
        ai.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        NULL::bigint AS log_id,
        NULL::bigint AS client_fingerprint_id,
        NULL::jsonb AS data
      FROM
        assessment_instances AS ai
        LEFT JOIN users AS u ON (u.id = ai.auth_user_id)
      WHERE
        ai.id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        2 AS event_order,
        'New variant'::text AS event_name,
        'gray1'::text AS event_color,
        v.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::integer AS submission_id,
        v.id AS log_id,
        v.client_fingerprint_id,
        jsonb_build_object(
          'variant_seed',
          v.variant_seed,
          'params',
          CASE
            WHEN $include_files THEN v.params
            ELSE (v.params - '_workspace_files')
          END,
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
        LEFT JOIN users AS u ON (u.id = v.authn_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        2.5 AS event_order,
        'Broken variant'::text AS event_name,
        'red3'::text AS event_color,
        v.broken_at AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::integer AS submission_id,
        v.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
        NULL::jsonb AS data
      FROM
        variants AS v
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.id = v.broken_by)
      WHERE
        v.broken_at IS NOT NULL
        AND iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        3 AS event_order,
        'Submission'::text AS event_name,
        'blue3'::text AS event_color,
        s.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        s.id AS submission_id,
        s.id AS log_id,
        s.client_fingerprint_id,
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
        LEFT JOIN users AS u ON (u.id = s.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        3.5 AS event_order,
        'External grading results'::text AS event_name,
        'blue1'::text AS event_color,
        gj.graded_at AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
        to_jsonb(gj.*) AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.id = s.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND gj.grading_method = 'External'
        AND gj.graded_at IS NOT NULL
    )
    UNION
    (
      SELECT
        3.7 AS event_order,
        CASE
          WHEN gj.grading_method = 'Manual' THEN 'Manual grading results'::text
          ELSE 'AI grading results'::text
        END AS event_name,
        'blue2'::text AS event_color,
        gj.graded_at AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
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
          s.id,
          'rubric_grading',
          CASE
            WHEN rg.id IS NULL THEN NULL
            ELSE (
              SELECT
                JSONB_BUILD_OBJECT(
                  'computed_points',
                  rg.computed_points,
                  'adjust_points',
                  rg.adjust_points,
                  'items',
                  JSONB_AGG(
                    JSONB_BUILD_OBJECT('text', rgi.description, 'points', rgi.points)
                  )
                )
              FROM
                rubric_grading_items rgi
              WHERE
                rgi.rubric_grading_id = rg.id
            )
          END
        ) AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.id = gj.auth_user_id)
        LEFT JOIN rubric_gradings AS rg ON (rg.id = gj.manual_rubric_grading_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        -- TODO: we want to show logs for grading job soft-deletions too.
        AND gj.grading_method IN ('Manual', 'AI')
        AND gj.graded_at IS NOT NULL
    )
    UNION
    (
      SELECT
        3.8 AS event_order,
        'AI grading results deleted'::text AS event_name,
        'red2'::text AS event_color,
        gj.deleted_at AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
        NULL::jsonb AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        -- Show the user that actually deleted the grading job, if available.
        LEFT JOIN users AS u ON (u.id = gj.deleted_by)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND gj.grading_method IN ('AI')
        AND gj.deleted_at IS NOT NULL
    )
    UNION
    (
      SELECT
        4 AS event_order,
        'Grade submission'::text AS event_name,
        'orange3'::text AS event_color,
        gj.graded_at AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        gj.id AS submission_id,
        gj.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
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
          s.true_answer
        ) AS data
      FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN users AS u ON (u.id = gj.auth_user_id)
      WHERE
        iq.assessment_instance_id = $assessment_instance_id
        AND gj.grading_method = 'Internal'
        AND gj.graded_at IS NOT NULL
    )
    UNION
    (
      SELECT
        5 AS event_order,
        'Score question'::text AS event_name,
        'brown1'::text AS event_color,
        qsl.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::integer AS submission_id,
        qsl.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
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
        LEFT JOIN users AS u ON (u.id = qsl.auth_user_id)
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
        'Score assessment'::text AS event_name,
        'brown3'::text AS event_color,
        asl.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        asl.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
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
        LEFT JOIN users AS u ON (u.id = asl.auth_user_id)
      WHERE
        asl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        7 AS event_order,
        CASE
          WHEN asl.open THEN 'Open'::text
          ELSE 'Close'::text
        END AS event_name,
        'gray3'::text AS event_color,
        asl.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        asl.id AS log_id,
        asl.client_fingerprint_id,
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
          ELSE NULL::jsonb
        END AS data
      FROM
        assessment_state_logs AS asl
        JOIN assessment_instances AS ai ON (ai.id = $assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        LEFT JOIN users AS u ON (u.id = asl.auth_user_id)
      WHERE
        asl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        7.5 AS event_order,
        'Time limit expiry'::text AS event_name,
        'red2'::text AS event_color,
        asl.date_limit AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        asl.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
        jsonb_build_object(
          'time_limit',
          format_interval (asl.date_limit - ai.date)
        ) AS data
      FROM
        assessment_state_logs AS asl
        JOIN assessment_instances AS ai ON (ai.id = $assessment_instance_id)
        LEFT JOIN users AS u ON (u.id = asl.auth_user_id)
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
        7.7 AS event_order,
        'Cross lockpoint'::text AS event_name,
        'purple2'::text AS event_color,
        aicl.crossed_at AS date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        aicl.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
        jsonb_build_object('zone_title', z.title, 'zone_number', z.number) AS data
      FROM
        assessment_instance_crossed_lockpoints AS aicl
        JOIN zones AS z ON (z.id = aicl.zone_id)
        LEFT JOIN users AS u ON (u.id = aicl.authn_user_id)
      WHERE
        aicl.assessment_instance_id = $assessment_instance_id
    )
    UNION
    (
      SELECT
        8 AS event_order,
        'View variant'::text AS event_name,
        'green3'::text AS event_color,
        pvl.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        q.qid,
        q.id AS question_id,
        iq.id AS instance_question_id,
        v.id AS variant_id,
        v.number AS variant_number,
        NULL::integer AS submission_id,
        pvl.id AS log_id,
        pvl.client_fingerprint_id,
        NULL::jsonb AS data
      FROM
        user_page_view_logs AS pvl
        JOIN variants AS v ON (v.id = pvl.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN questions AS q ON (q.id = pvl.question_id)
        JOIN users AS u ON (u.id = pvl.authn_user_id)
        JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
      WHERE
        pvl.page_type = 'studentInstanceQuestion'
    )
    UNION
    (
      SELECT
        9 AS event_order,
        'View assessment overview'::text AS event_name,
        'green1'::text AS event_color,
        pvl.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        pvl.id AS log_id,
        pvl.client_fingerprint_id,
        NULL::jsonb AS data
      FROM
        user_page_view_logs AS pvl
        JOIN users AS u ON (u.id = pvl.authn_user_id)
        JOIN assessment_instances AS ai ON (ai.id = pvl.assessment_instance_id)
      WHERE
        pvl.page_type = 'studentAssessmentInstance'
    )
    UNION
    (
      SELECT
        10 AS event_order,
        ('Group ' || gl.action)::text AS event_name,
        'gray2'::text AS event_color,
        gl.date,
        u.id AS auth_user_id,
        u.uid AS auth_user_uid,
        NULL::text AS qid,
        NULL::integer AS question_id,
        NULL::integer AS instance_question_id,
        NULL::integer AS variant_id,
        NULL::integer AS variant_number,
        NULL::integer AS submission_id,
        gl.id AS log_id,
        NULL::bigint AS client_fingerprint_id,
        jsonb_strip_nulls(
          jsonb_build_object('user', gu.uid, 'roles', gl.roles)
        ) AS data
      FROM
        assessment_instances AS ai
        JOIN team_logs AS gl ON (gl.team_id = ai.team_id)
        JOIN users AS u ON (u.id = gl.authn_user_id)
        LEFT JOIN users AS gu ON (gu.id = gl.user_id)
      WHERE
        ai.id = $assessment_instance_id
    )
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
  to_jsonb(cf.*) AS client_fingerprint,
  NULL AS client_fingerprint_number,
  format_date_full_compact (el.date, ci.display_timezone) AS formatted_date,
  format_date_iso8601 (el.date, ci.display_timezone) AS date_iso8601,
  qd.student_question_number,
  qd.instructor_question_number
FROM
  event_log AS el
  LEFT JOIN client_fingerprints AS cf ON (cf.id = el.client_fingerprint_id)
  LEFT JOIN question_data AS qd ON (qd.instance_question_id = el.instance_question_id),
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  ai.id = $assessment_instance_id
ORDER BY
  el.date,
  el.event_order,
  el.log_id,
  el.question_id;

-- BLOCK calculate_stats_for_assessment_question
WITH
  relevant_assessment_instances AS (
    SELECT DISTINCT
      ai.*
    FROM
      assessment_questions AS aq
      JOIN assessments AS a ON (a.id = aq.assessment_id)
      JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    WHERE
      aq.id = $assessment_question_id
      AND ai.include_in_statistics
  ),
  relevant_instance_questions AS (
    SELECT DISTINCT
      iq.*,
      -- Determine a unique ID for each user or group by making group IDs
      -- negative. Exactly one of user_id or group_id will be NULL, so this
      -- results in a unqiue non-NULL ID for each assessment instance.
      coalesce(ai.user_id, - ai.team_id) AS u_gr_id
    FROM
      instance_questions AS iq
      JOIN relevant_assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE
      iq.assessment_question_id = $assessment_question_id
  ),
  assessment_scores_by_user_or_group AS (
    SELECT
      coalesce(ai.user_id, - ai.team_id) AS u_gr_id,
      max(ai.score_perc) AS score_perc
    FROM
      relevant_assessment_instances AS ai
    GROUP BY
      coalesce(ai.user_id, - ai.team_id)
  ),
  question_stats_by_user_or_group AS (
    SELECT
      iq.u_gr_id,
      avg(iq.score_perc) AS score_perc,
      100 * count(iq.id) FILTER (
        WHERE
          iq.some_submission = TRUE
      ) / count(iq.id) AS some_submission_perc,
      100 * count(iq.id) FILTER (
        WHERE
          iq.some_perfect_submission = TRUE
      ) / count(iq.id) AS some_perfect_submission_perc,
      100 * count(iq.id) FILTER (
        WHERE
          iq.some_nonzero_submission = TRUE
      ) / count(iq.id) AS some_nonzero_submission_perc,
      avg(iq.first_submission_score) AS first_submission_score,
      avg(iq.last_submission_score) AS last_submission_score,
      avg(iq.max_submission_score) AS max_submission_score,
      avg(iq.average_submission_score) AS average_submission_score,
      array_avg (iq.submission_score_array) AS submission_score_array,
      array_avg (iq.incremental_submission_score_array) AS incremental_submission_score_array,
      array_avg (iq.incremental_submission_points_array) AS incremental_submission_points_array,
      avg(iq.number_attempts) AS number_submissions
    FROM
      relevant_instance_questions AS iq
    GROUP BY
      iq.u_gr_id
  ),
  user_quintiles AS (
    SELECT
      assessment_scores_by_user_or_group.u_gr_id,
      ntile(5) OVER (
        ORDER BY
          assessment_scores_by_user_or_group.score_perc
      ) AS quintile
    FROM
      assessment_scores_by_user_or_group
  ),
  quintile_scores AS (
    SELECT
      avg(question_stats_by_user_or_group.score_perc) AS quintile_score
    FROM
      question_stats_by_user_or_group
      JOIN user_quintiles USING (u_gr_id)
    GROUP BY
      user_quintiles.quintile
    ORDER BY
      user_quintiles.quintile
  ),
  quintile_scores_as_array AS (
    SELECT
      array_agg(quintile_score) AS scores
    FROM
      quintile_scores
  ),
  aq_stats AS (
    SELECT
      least(
        100,
        greatest(
          0,
          avg(question_stats_by_user_or_group.score_perc)
        )
      ) AS mean_question_score,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY
          question_stats_by_user_or_group.score_perc
      ) AS median_question_score,
      sqrt(
        var_pop(question_stats_by_user_or_group.score_perc)
      ) AS question_score_variance,
      coalesce(
        corr(
          question_stats_by_user_or_group.score_perc,
          assessment_scores_by_user_or_group.score_perc
        ) * 100,
        CASE
          WHEN count(question_stats_by_user_or_group.score_perc) > 0 THEN 0
          ELSE NULL
        END
      ) AS discrimination,
      avg(
        question_stats_by_user_or_group.some_submission_perc
      ) AS some_submission_perc,
      avg(
        question_stats_by_user_or_group.some_perfect_submission_perc
      ) AS some_perfect_submission_perc,
      avg(
        question_stats_by_user_or_group.some_nonzero_submission_perc
      ) AS some_nonzero_submission_perc,
      avg(
        question_stats_by_user_or_group.first_submission_score
      ) AS average_first_submission_score,
      sqrt(
        var_pop(
          question_stats_by_user_or_group.first_submission_score
        )
      ) AS first_submission_score_variance,
      histogram (
        question_stats_by_user_or_group.first_submission_score,
        0,
        1,
        10
      ) AS first_submission_score_hist,
      avg(
        question_stats_by_user_or_group.last_submission_score
      ) AS average_last_submission_score,
      sqrt(
        var_pop(
          question_stats_by_user_or_group.last_submission_score
        )
      ) AS last_submission_score_variance,
      histogram (
        question_stats_by_user_or_group.last_submission_score,
        0,
        1,
        10
      ) AS last_submission_score_hist,
      avg(
        question_stats_by_user_or_group.max_submission_score
      ) AS average_max_submission_score,
      sqrt(
        var_pop(
          question_stats_by_user_or_group.max_submission_score
        )
      ) AS max_submission_score_variance,
      histogram (
        question_stats_by_user_or_group.max_submission_score,
        0,
        1,
        10
      ) AS max_submission_score_hist,
      avg(
        question_stats_by_user_or_group.average_submission_score
      ) AS average_average_submission_score,
      sqrt(
        var_pop(
          question_stats_by_user_or_group.average_submission_score
        )
      ) AS average_submission_score_variance,
      histogram (
        question_stats_by_user_or_group.average_submission_score,
        0,
        1,
        10
      ) AS average_submission_score_hist,
      array_avg (
        question_stats_by_user_or_group.submission_score_array
      ) AS submission_score_array_averages,
      array_var (
        question_stats_by_user_or_group.submission_score_array
      ) AS submission_score_array_variances,
      array_avg (
        question_stats_by_user_or_group.incremental_submission_score_array
      ) AS incremental_submission_score_array_averages,
      array_var (
        question_stats_by_user_or_group.incremental_submission_score_array
      ) AS incremental_submission_score_array_variances,
      array_avg (
        question_stats_by_user_or_group.incremental_submission_points_array
      ) AS incremental_submission_points_array_averages,
      array_var (
        question_stats_by_user_or_group.incremental_submission_points_array
      ) AS incremental_submission_points_array_variances,
      avg(
        question_stats_by_user_or_group.number_submissions
      ) AS average_number_submissions,
      var_pop(
        question_stats_by_user_or_group.number_submissions
      ) AS number_submissions_variance,
      histogram (
        question_stats_by_user_or_group.number_submissions,
        0,
        10,
        10
      ) AS number_submissions_hist
    FROM
      question_stats_by_user_or_group
      JOIN assessment_scores_by_user_or_group USING (u_gr_id)
  )
UPDATE assessment_questions AS aq
SET
  quintile_question_scores = quintile_scores_as_array.scores,
  mean_question_score = aq_stats.mean_question_score,
  median_question_score = aq_stats.median_question_score,
  question_score_variance = aq_stats.question_score_variance,
  discrimination = aq_stats.discrimination,
  some_submission_perc = aq_stats.some_submission_perc,
  some_perfect_submission_perc = aq_stats.some_perfect_submission_perc,
  some_nonzero_submission_perc = aq_stats.some_nonzero_submission_perc,
  average_first_submission_score = aq_stats.average_first_submission_score,
  first_submission_score_variance = aq_stats.first_submission_score_variance,
  first_submission_score_hist = aq_stats.first_submission_score_hist,
  average_last_submission_score = aq_stats.average_last_submission_score,
  last_submission_score_variance = aq_stats.last_submission_score_variance,
  last_submission_score_hist = aq_stats.last_submission_score_hist,
  average_max_submission_score = aq_stats.average_max_submission_score,
  max_submission_score_variance = aq_stats.max_submission_score_variance,
  max_submission_score_hist = aq_stats.max_submission_score_hist,
  average_average_submission_score = aq_stats.average_average_submission_score,
  average_submission_score_variance = aq_stats.average_submission_score_variance,
  average_submission_score_hist = aq_stats.average_submission_score_hist,
  submission_score_array_averages = aq_stats.submission_score_array_averages,
  submission_score_array_variances = aq_stats.submission_score_array_variances,
  incremental_submission_score_array_averages = aq_stats.incremental_submission_score_array_averages,
  incremental_submission_score_array_variances = aq_stats.incremental_submission_score_array_variances,
  incremental_submission_points_array_averages = aq_stats.incremental_submission_points_array_averages,
  incremental_submission_points_array_variances = aq_stats.incremental_submission_points_array_variances,
  average_number_submissions = aq_stats.average_number_submissions,
  number_submissions_variance = aq_stats.number_submissions_variance,
  number_submissions_hist = aq_stats.number_submissions_hist
FROM
  quintile_scores_as_array,
  aq_stats
WHERE
  aq.id = $assessment_question_id;

-- BLOCK select_assessment_questions
SELECT
  aq.id
FROM
  assessment_questions AS aq
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL;

-- BLOCK update_assessment_stats_last_updated
UPDATE assessments AS a
SET
  stats_last_updated = current_timestamp
WHERE
  a.id = $assessment_id;

-- BLOCK delete_assessment_instance
WITH
  deleted_assessment_instances AS (
    DELETE FROM assessment_instances AS ai
    WHERE
      ai.assessment_id = $assessment_id
      AND ai.id = $assessment_instance_id
    RETURNING
      ai.*
  ),
  new_log AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        course_id,
        course_instance_id,
        user_id,
        team_id,
        table_name,
        row_id,
        action,
        old_state
      )
    SELECT
      $authn_user_id,
      ci.course_id,
      a.course_instance_id,
      ai.user_id,
      ai.team_id,
      'assessment_instances',
      ai.id,
      'delete',
      to_jsonb(ai.*)
    FROM
      deleted_assessment_instances AS ai
      LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  )
SELECT
  ai.id
FROM
  deleted_assessment_instances AS ai;

-- BLOCK delete_all_assessment_instances_for_assessment
WITH
  deleted_assessment_instances AS (
    DELETE FROM assessment_instances AS ai
    WHERE
      ai.assessment_id = $assessment_id
    RETURNING
      ai.*
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    course_id,
    course_instance_id,
    user_id,
    team_id,
    table_name,
    row_id,
    action,
    old_state
  )
SELECT
  $authn_user_id,
  ci.course_id,
  a.course_instance_id,
  ai.user_id,
  ai.team_id,
  'assessment_instances',
  ai.id,
  'delete',
  to_jsonb(ai.*)
FROM
  deleted_assessment_instances AS ai
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id);

-- BLOCK select_assessment_instance_last_submission_date
SELECT
  max(s.date)
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id;
