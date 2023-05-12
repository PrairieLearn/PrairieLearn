-- BLOCK select_assessments
WITH
  multiple_instance_assessments AS (
    SELECT
      TRUE AS multiple_instance_header,
      a.id AS assessment_id,
      a.number AS assessment_number,
      a.order_by AS assessment_order_by,
      a.title AS title,
      a.group_work AS group_work,
      aset.id AS assessment_set_id,
      aset.abbreviation AS assessment_set_abbreviation,
      aset.name AS assessment_set_name,
      aset.heading AS assessment_set_heading,
      aset.color AS assessment_set_color,
      aset.number AS assessment_set_number,
      aset.abbreviation || a.number AS label,
      aa.authorized,
      aa.credit,
      aa.credit_date_string,
      aa.active AS active,
      aa.access_rules,
      aa.show_closed_assessment_score,
      NULL::integer AS assessment_instance_id,
      NULL::integer AS assessment_instance_number,
      NULL::integer AS assessment_instance_score_perc,
      NULL::boolean AS assessment_instance_open,
      am.id AS assessment_module_id,
      am.name AS assessment_module_name,
      am.heading AS assessment_module_heading,
      am.number AS assessment_module_number
    FROM
      assessments AS a
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
      LEFT JOIN assessment_modules AS am ON am.id = a.assessment_module_id
    WHERE
      ci.id = $course_instance_id
      AND a.multiple_instance
      AND a.deleted_at IS NULL
  ),
  multiple_instance_assessment_instances AS (
    SELECT
      FALSE AS multiple_instance_header,
      mia.assessment_id,
      mia.assessment_number,
      mia.assessment_order_by,
      mia.title || ' instance #' || ai.number,
      NULL::boolean AS group_work,
      mia.assessment_set_id,
      mia.assessment_set_abbreviation,
      mia.assessment_set_name,
      mia.assessment_set_heading,
      mia.assessment_set_color,
      mia.assessment_set_number,
      mia.label || '#' || ai.number AS label,
      mia.authorized,
      mia.credit,
      mia.credit_date_string,
      mia.active AS active,
      mia.access_rules,
      mia.show_closed_assessment_score,
      ai.id AS assessment_instance_id,
      ai.number AS assessment_instance_number,
      ai.score_perc AS assessment_instance_score_perc,
      ai.open AS assessment_instance_open,
      am.id AS assessment_module_id,
      am.name AS assessment_module_name,
      am.heading AS assessment_module_heading,
      am.number AS assessment_module_number
    FROM
      assessment_instances AS ai
      JOIN multiple_instance_assessments AS mia ON (mia.assessment_id = ai.assessment_id)
      LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
    WHERE
      ai.user_id = $user_id
  ),
  single_instance_assessments AS (
    SELECT
      FALSE AS multiple_instance_header,
      a.id AS assessment_id,
      a.number AS assessment_number,
      a.order_by AS assessment_order_by,
      a.title AS title,
      a.group_work AS group_work,
      aset.id AS assessment_set_id,
      aset.abbreviation AS assessment_set_abbreviation,
      aset.name AS assessment_set_name,
      aset.heading AS assessment_set_heading,
      aset.color AS assessment_set_color,
      aset.number AS assessment_set_number,
      aset.abbreviation || a.number AS label,
      aa.authorized,
      aa.credit,
      aa.credit_date_string,
      aa.active AS active,
      aa.access_rules,
      aa.show_closed_assessment_score,
      ai.id AS assessment_instance_id,
      ai.number AS assessment_instance_number,
      ai.score_perc AS assessment_instance_score_perc,
      ai.open AS assessment_instance_open,
      am.id AS assessment_module_id,
      am.name AS assessment_module_name,
      am.heading AS assessment_module_heading,
      am.number AS assessment_module_number
    FROM
      -- join group_users first to find all group assessments
      group_configs AS gc
      JOIN groups AS g ON (
        g.group_config_id = gc.id
        AND g.deleted_at IS NULL
      )
      JOIN group_users AS gu ON (
        gu.group_id = g.id
        AND gu.user_id = $user_id
      )
      FULL JOIN assessments AS a ON (gc.assessment_id = a.id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      -- We use a subquery to find assessment instances by either user_id or
      -- group_id. We use to do this with AND (ai.user_id = $user_id OR
      -- ai.group_id = gu.group_id) but this was triggering a bad query plan for
      -- some course instances. Having separate SELECTs for user_id and group_id
      -- allows the query planner to utilize the two separate indexes we have
      -- for user_id and group_id.
      LEFT JOIN LATERAL (
        SELECT
          *
        FROM
          assessment_instances AS ai1
        WHERE
          ai1.assessment_id = a.id
          AND ai1.user_id = $user_id
        UNION
        SELECT
          *
        FROM
          assessment_instances AS ai2
        WHERE
          ai2.assessment_id = a.id
          AND ai2.group_id = gu.group_id
      ) AS ai ON (TRUE)
      LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
      LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
    WHERE
      ci.id = $course_instance_id
      AND NOT a.multiple_instance
      AND a.deleted_at IS NULL
      AND gc.deleted_at IS NULL
  ),
  all_rows AS (
    SELECT
      *
    FROM
      multiple_instance_assessments
    UNION
    SELECT
      *
    FROM
      multiple_instance_assessment_instances
    UNION
    SELECT
      *
    FROM
      single_instance_assessments
  )
SELECT
  *,
  CASE
    WHEN assessment_instance_id IS NULL THEN '/assessment/' || assessment_id || '/'
    ELSE '/assessment_instance/' || assessment_instance_id || '/'
  END AS link,
  (
    LAG(
      CASE
        WHEN $assessments_group_by = 'Set' THEN assessment_set_id
        ELSE assessment_module_id
      END
    ) OVER (
      PARTITION BY
        (
          CASE
            WHEN $assessments_group_by = 'Set' THEN assessment_set_id
            ELSE assessment_module_id
          END
        )
        -- Note that we set `NULLS FIRST` to ensure that the rows from
        -- `multiple_instance_assessments` are always first, as they have a
        -- null `assessment_instance_number`.
      ORDER BY
        assessment_set_number,
        assessment_order_by,
        assessment_id,
        assessment_instance_number NULLS FIRST
    ) IS NULL
  ) AS start_new_assessment_group,
  (
    CASE
      WHEN $assessments_group_by = 'Set' THEN assessment_set_heading
      ELSE assessment_module_heading
    END
  ) AS assessment_group_heading
FROM
  all_rows
WHERE
  authorized
ORDER BY
  CASE
    WHEN $assessments_group_by = 'Module' THEN assessment_module_number
  END,
  CASE
    WHEN $assessments_group_by = 'Module' THEN assessment_module_id
  END,
  assessment_set_number,
  assessment_order_by,
  assessment_id,
  assessment_instance_number
  -- As with the `PARTITION` above, we deliberately set `NULLS FIRST` to
  -- ensure the correct ordering of rows from `multiple_instance_assessments`.
  NULLS FIRST;
