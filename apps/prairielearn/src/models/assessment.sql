-- BLOCK lock_assessment_row
SELECT
  id
FROM
  assessments
WHERE
  id = $assessment_id
FOR NO KEY UPDATE;

-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
WHERE
  id = $assessment_id;

-- BLOCK select_assessment_by_tid
SELECT
  *
FROM
  assessments
WHERE
  tid = $tid
  AND course_instance_id = $course_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_assessment_by_uuid
SELECT
  *
FROM
  assessments
WHERE
  uuid = $uuid
  AND course_instance_id = $course_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_assessment_info_for_job
SELECT
  aset.abbreviation || a.number AS assessment_label,
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

-- BLOCK select_zone_id_for_instance_question
SELECT
  z.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  LEFT JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
  LEFT JOIN zones AS z ON z.id = ag.zone_id
WHERE
  iq.id = $instance_question_id;

-- BLOCK select_assessment_tools
SELECT
  *
FROM
  assessment_tools
WHERE
  zone_id = $zone_id
  OR assessment_id = $assessment_id;

-- BLOCK select_assessments_for_course_instance
WITH
  issue_count AS (
    SELECT
      a.id AS assessment_id,
      count(*) AS open_issue_count
    FROM
      assessments AS a
      JOIN issues AS i ON (i.assessment_id = a.id)
    WHERE
      a.course_instance_id = $course_instance_id
      AND i.course_caused
      AND i.open
    GROUP BY
      a.id
  )
SELECT
  a.*,
  EXISTS (
    SELECT
      1
    FROM
      assessment_instances AS ai
    WHERE
      ai.assessment_id = a.id
      AND ai.modified_at > a.statistics_last_updated_at - interval '1 minute'
  ) AS needs_statistics_update,
  (aset.abbreviation || a.number) AS label,
  aset.name,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(am) AS assessment_module,
  (
    LAG(
      CASE
        WHEN ci.assessments_group_by = 'Set' THEN aset.id
        ELSE am.id
      END
    ) OVER (
      PARTITION BY
        (
          CASE
            WHEN ci.assessments_group_by = 'Set' THEN aset.id
            ELSE am.id
          END
        )
      ORDER BY
        aset.number,
        a.order_by,
        a.id
    ) IS NULL
  ) AS start_new_assessment_group,
  coalesce(ic.open_issue_count, 0) AS open_issue_count
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN issue_count AS ic ON (ic.assessment_id = a.id)
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
ORDER BY
  (
    CASE
      WHEN ci.assessments_group_by = 'Module' THEN am.number
    END
  ),
  (
    CASE
      WHEN ci.assessments_group_by = 'Module' THEN am.id
    END
  ),
  aset.number,
  a.order_by,
  a.id;

-- BLOCK select_zone_tool_overrides
SELECT
  z.number AS zone_number,
  at.tool,
  at.enabled
FROM
  assessment_tools AS at
  JOIN zones AS z ON (at.zone_id = z.id)
WHERE
  z.assessment_id = $assessment_id;

-- BLOCK select_assessment_zone_points_range
WITH
  -- For each alternative group, rank questions by max_points (best and worst).
  -- When number_choose is set, only a subset of questions is selected.
  alt_group_questions AS (
    SELECT
      ag.id AS ag_id,
      ag.zone_id,
      ag.number_choose,
      aq.max_points,
      row_number() OVER (
        PARTITION BY
          ag.id
        ORDER BY
          aq.max_points DESC
      ) AS rank_desc,
      row_number() OVER (
        PARTITION BY
          ag.id
        ORDER BY
          aq.max_points ASC
      ) AS rank_asc
    FROM
      alternative_groups AS ag
      JOIN assessment_questions AS aq ON (aq.alternative_group_id = ag.id)
    WHERE
      ag.zone_id IN (
        SELECT
          id
        FROM
          zones
        WHERE
          assessment_id = $assessment_id
      )
      AND aq.deleted_at IS NULL
  ),
  -- Sum the best-case and worst-case points per alternative group.
  alt_group_totals AS (
    SELECT
      ag_id,
      zone_id,
      sum(max_points) FILTER (
        WHERE
          number_choose IS NULL
          OR rank_desc <= number_choose
      ) AS max_points,
      sum(max_points) FILTER (
        WHERE
          number_choose IS NULL
          OR rank_asc <= number_choose
      ) AS min_points
    FROM
      alt_group_questions
    GROUP BY
      ag_id,
      zone_id
  ),
  -- Within each zone, rank alternative group totals for best_questions / number_choose.
  zone_blocks AS (
    SELECT
      agt.zone_id,
      agt.max_points,
      agt.min_points,
      z.best_questions,
      z.number_choose AS zone_number_choose,
      z.max_points AS zone_max_points,
      row_number() OVER (
        PARTITION BY
          agt.zone_id
        ORDER BY
          agt.max_points DESC
      ) AS rank_best,
      row_number() OVER (
        PARTITION BY
          agt.zone_id
        ORDER BY
          agt.min_points ASC
      ) AS rank_worst
    FROM
      alt_group_totals AS agt
      JOIN zones AS z ON (z.id = agt.zone_id)
  ),
  -- Compute per-zone best-case and worst-case totals.
  zone_totals AS (
    SELECT
      zone_id,
      zone_max_points,
      sum(max_points) FILTER (
        WHERE
          coalesce(best_questions, zone_number_choose) IS NULL
          OR rank_best <= coalesce(best_questions, zone_number_choose)
      ) AS zone_max,
      sum(min_points) FILTER (
        WHERE
          coalesce(best_questions, zone_number_choose) IS NULL
          OR rank_worst <= coalesce(best_questions, zone_number_choose)
      ) AS zone_min
    FROM
      zone_blocks
    GROUP BY
      zone_id,
      zone_max_points
  )
SELECT
  coalesce(
    sum(
      CASE
        WHEN zone_max_points IS NOT NULL THEN LEAST(zone_max, zone_max_points)
        ELSE zone_max
      END
    ),
    0
  ) AS max_total,
  coalesce(
    sum(
      CASE
        WHEN zone_max_points IS NOT NULL THEN LEAST(zone_min, zone_max_points)
        ELSE zone_min
      END
    ),
    0
  ) AS min_total
FROM
  zone_totals;
