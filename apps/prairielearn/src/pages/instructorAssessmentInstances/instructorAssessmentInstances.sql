-- BLOCK select_assessment_instances
SELECT
  (aset.name || ' ' || a.number) AS assessment_label,
  u.user_id,
  u.uid,
  u.name,
  users_get_displayed_role (u.user_id, ci.id) AS role,
  gi.id AS group_id,
  gi.name AS group_name,
  gi.uid_list,
  gi.user_name_list,
  gi.user_roles_list as group_roles,
  substring(
    u.uid
    from
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
    AND ai.date_limit IS NOT NULL
    AND ai.date_limit <= current_timestamp THEN 'Expired'
    WHEN ai.open
    AND ai.date_limit IS NOT NULL
    AND floor(
      DATE_PART('epoch', (ai.date_limit - current_timestamp))
    ) < 60 THEN '< 1 min'
    WHEN ai.open
    AND ai.date_limit IS NOT NULL THEN greatest(
      0,
      floor(
        DATE_PART('epoch', (ai.date_limit - current_timestamp)) / 60
      )
    )::text || ' min'
    WHEN ai.open THEN 'Open (no time limit)'
    WHEN ai.open = FALSE
    AND ai.grading_needed THEN 'Closed (pending grading)'
    ELSE 'Closed'
  END AS time_remaining,
  CASE
    WHEN ai.open
    AND ai.date_limit IS NOT NULL THEN greatest(
      0,
      DATE_PART('epoch', (ai.date_limit - current_timestamp))
    )
    ELSE NULL
  END AS time_remaining_sec,
  CASE
    WHEN ai.open
    AND ai.date_limit IS NOT NULL
    AND floor(DATE_PART('epoch', (ai.date_limit - ai.date))) < 60 THEN '< 1 min'
    WHEN ai.open
    AND ai.date_limit IS NOT NULL THEN greatest(
      0,
      floor(
        DATE_PART('epoch', (ai.date_limit - ai.date)) / 60
      )
    )::text || ' min'
    WHEN ai.open THEN 'Open (no time limit)'
    ELSE 'Closed'
  END AS total_time,
  CASE
    WHEN ai.open
    AND ai.date_limit IS NOT NULL THEN greatest(0, DATE_PART('epoch', (ai.date_limit - ai.date)))
    ELSE NULL
  END AS total_time_sec,
  ai.date,
  format_date_full_compact (ai.date, ci.display_timezone) AS date_formatted,
  format_interval (ai.duration) AS duration,
  DATE_PART('epoch', ai.duration) AS duration_secs,
  DATE_PART('epoch', ai.duration) / 60 AS duration_mins,
  (
    row_number() OVER (
      PARTITION BY
        u.user_id
      ORDER BY
        score_perc DESC,
        ai.number DESC,
        ai.id DESC
    )
  ) = 1 AS highest_score,
  ai.client_fingerprint_id_change_count
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  LEFT JOIN group_info ($assessment_id) AS gi ON (gi.id = ai.group_id)
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
  a.id = $assessment_id
ORDER BY
  u.uid,
  u.user_id,
  ai.number,
  ai.id;

-- BLOCK set_time_limit
WITH
  results AS (
    UPDATE assessment_instances AS ai
    SET
      open = TRUE,
      auto_close = FALSE,
      date_limit = CASE
        WHEN $base_time = 'null' THEN NULL
        ELSE GREATEST(
          current_timestamp,
          (
            CASE
              WHEN $base_time = 'start_date' THEN ai.date
              WHEN $base_time = 'current_date' THEN current_timestamp
              ELSE ai.date_limit
            END
          ) + (
            CASE
              WHEN $time_ref = 'minutes' THEN make_interval(mins => $time_add)
              WHEN $time_ref = 'percent' THEN (ai.date_limit - ai.date) * $time_add / 100
              ELSE make_interval(secs => 0)
            END
          )
        )
      END,
      modified_at = now()
    WHERE
      ai.id = $assessment_instance_id
      AND ai.assessment_id = $assessment_id
    RETURNING
      ai.open,
      ai.id AS assessment_instance_id,
      ai.date_limit
  )
INSERT INTO
  assessment_state_logs AS asl (
    open,
    assessment_instance_id,
    date_limit,
    auth_user_id
  ) (
    SELECT
      true,
      results.assessment_instance_id,
      results.date_limit,
      $authn_user_id
    FROM
      results
  );

-- BLOCK set_time_limit_all
WITH
  results AS (
    UPDATE assessment_instances AS ai
    SET
      open = TRUE,
      auto_close = FALSE,
      date_limit = CASE
        WHEN $base_time = 'null' THEN NULL
        ELSE GREATEST(
          current_timestamp,
          (
            CASE
              WHEN $base_time = 'start_date' THEN ai.date
              WHEN $base_time = 'current_date' THEN current_timestamp
              ELSE ai.date_limit
            END
          ) + (
            CASE
              WHEN $time_ref = 'minutes' THEN make_interval(mins => $time_add)
              WHEN $time_ref = 'percent' THEN (ai.date_limit - ai.date) * $time_add / 100
              ELSE make_interval(secs => 0)
            END
          )
        )
      END,
      modified_at = now()
    WHERE
      (
        ai.open
        OR $reopen_closed
      )
      AND ai.assessment_id = $assessment_id
      AND (
        ai.date_limit IS NOT NULL
        OR (
          $base_time != 'date_limit'
          AND $time_ref != 'percent'
        )
      )
    RETURNING
      ai.open,
      ai.id AS assessment_instance_id,
      ai.date_limit
  )
INSERT INTO
  assessment_state_logs AS asl (
    open,
    assessment_instance_id,
    date_limit,
    auth_user_id
  ) (
    SELECT
      true,
      results.assessment_instance_id,
      results.date_limit,
      $authn_user_id
    FROM
      results
  );
