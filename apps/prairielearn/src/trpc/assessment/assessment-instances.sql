-- BLOCK select_assessment_instances
WITH
  group_user_lists AS (
    SELECT
      g.id,
      array_agg(u.uid) AS uid_list,
      array_agg(u.name) AS user_name_list,
      array_agg(
        users_get_displayed_role (u.id, a.course_instance_id)
      ) AS user_roles_list
    FROM
      team_configs AS gc
      JOIN assessments AS a ON (a.id = gc.assessment_id)
      JOIN teams AS g ON (g.team_config_id = gc.id)
      JOIN team_users AS gu ON (gu.team_id = g.id)
      JOIN users AS u ON (u.id = gu.user_id)
    WHERE
      gc.assessment_id = $assessment_id
      AND gc.deleted_at IS NULL
      AND g.deleted_at IS NULL
    GROUP BY
      g.id
  )
SELECT
  to_jsonb(ai.*) AS assessment_instance,
  to_jsonb(u.*) AS "user",
  to_jsonb(g.*) AS "group",
  (aset.name || ' ' || a.number) AS assessment_label,
  users_get_displayed_role (u.id, ci.id) AS role,
  gul.uid_list,
  gul.user_name_list,
  gul.user_roles_list AS group_roles,
  substring(
    u.uid
    FROM
      '^[^@]+'
  ) AS username,
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
  (
    row_number() OVER (
      PARTITION BY
        u.id
      ORDER BY
        ai.score_perc DESC,
        ai.number DESC,
        ai.id DESC
    )
  ) = 1 AS highest_score
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN group_user_lists AS gul ON (gul.id = ai.team_id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
WHERE
  a.id = $assessment_id
  -- Filter out group instances that don't have an undeleted group
  AND (
    ai.team_id IS NULL
    OR g.id IS NOT NULL
  )
ORDER BY
  u.uid,
  u.id,
  ai.number,
  ai.id;
