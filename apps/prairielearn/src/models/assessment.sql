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

-- BLOCK check_assessment_is_public
SELECT
  a.share_source_publicly
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK select_assessment_info_for_job
SELECT
  aset.abbreviation || a.number AS assessment_label,
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

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
