WITH
  existing_duplicate_users AS (
    SELECT
      user_id,
      group_config_id,
      array_agg(group_id) AS group_ids
    FROM
      group_users
    GROUP BY
      user_id,
      group_config_id
    HAVING
      COUNT(*) > 1
  ),
  group_memberships AS (
    SELECT
      g.group_id,
      COUNT(*) AS count
    FROM
      (
        SELECT DISTINCT
          UNNEST(group_ids) AS group_id
        FROM
          existing_duplicate_users
      ) AS g
      JOIN group_users AS gu ON (g.group_id = gu.group_id)
    GROUP BY
      g.group_id
  ),
  group_to_retain AS (
    SELECT
      edu.user_id,
      edu.group_config_id,
      (
        SELECT
          gu.group_id
        FROM
          group_users AS gu
          JOIN groups AS g ON (gu.group_id = g.id)
          LEFT JOIN group_memberships AS gm ON (gu.group_id = gm.group_id)
          LEFT JOIN assessment_instances AS ai ON (
            a.id = ai.assessment_id
            AND ai.group_id = gu.group_id
          )
        WHERE
          edu.user_id = gu.user_id
          AND edu.group_config_id = gu.group_config_id
        ORDER BY
          -- If there is a soft-deleted group, prefer one that is not soft-deleted
          g.deleted_at IS NOT NULL,
          -- If there is an assessment instance, prefer the one with the highest score
          ai.score_perc DESC NULLS LAST,
          -- Prefer a group with an assessment instance over one without it
          ai.id IS NULL,
          -- Prefer a group with larger membership
          gm.count DESC,
          -- If there is an assessment instance, prefer the one created most recently (largest ID)
          ai.id DESC NULLS LAST,
          -- Prefer a group created most recently (largest ID)
          gu.group_id DESC
        LIMIT
          1
      ) AS group_id
    FROM
      existing_duplicate_users AS edu
      JOIN group_configs AS gc ON (edu.group_config_id = gc.id)
      LEFT JOIN assessments AS a ON (gc.assessment_id = a.id)
  )
DELETE FROM group_users AS gu USING group_to_retain AS gtr
WHERE
  gu.user_id = gtr.user_id
  AND gu.group_config_id = gtr.group_config_id
  AND gu.group_id != gtr.group_id;
