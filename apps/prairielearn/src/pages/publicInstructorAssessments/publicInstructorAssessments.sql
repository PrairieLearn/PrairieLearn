-- BLOCK select_assessments
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
  aset.abbreviation,
  aset.name,
  aset.color,
  (aset.abbreviation || a.number) as label,
  (
    LAG(
      CASE
        WHEN $assessments_group_by = 'Set' THEN aset.id
        ELSE am.id
      END
    ) OVER (
      PARTITION BY
        (
          CASE
            WHEN $assessments_group_by = 'Set' THEN aset.id
            ELSE am.id
          END
        )
      ORDER BY
        aset.number,
        a.order_by,
        a.id
    ) IS NULL
  ) AS start_new_assessment_group,
  (
    CASE
      WHEN $assessments_group_by = 'Set' THEN aset.heading
      ELSE am.heading
    END
  ) AS assessment_group_heading,
  coalesce(ic.open_issue_count, 0) AS open_issue_count
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
  LEFT JOIN issue_count AS ic ON (ic.assessment_id = a.id)
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
  AND aa.authorized
ORDER BY
  (
    CASE
      WHEN $assessments_group_by = 'Module' THEN am.number
    END
  ),
  (
    CASE
      WHEN $assessments_group_by = 'Module' THEN am.id
    END
  ),
  aset.number,
  a.order_by,
  a.id;

-- BLOCK select_assessment
SELECT
  a.*
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
  a.id = $assessment_id
  AND ci.id = $course_instance_id
  AND a.deleted_at IS NULL
  AND aa.authorized;

-- BLOCK select_assessment_id_from_uuid
SELECT
  a.id AS assessment_id
FROM
  assessments AS a
WHERE
  a.uuid = $uuid
  AND a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;
