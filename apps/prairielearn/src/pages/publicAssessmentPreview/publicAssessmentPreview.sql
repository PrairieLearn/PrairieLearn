-- BLOCK select_assessments
SELECT
  a.*,
  aset.abbreviation,
  aset.name,
  aset.color,
  (aset.abbreviation || a.number) as label,
  (
    CASE
      WHEN $assessments_group_by = 'Set' THEN aset.heading
      ELSE am.heading
    END
  ) AS assessment_group_heading
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
  AND ci.share_source_publicly = TRUE
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

-- BLOCK check_is_public
SELECT
  ci.share_source_publicly
FROM
  course_instances AS ci
WHERE
  ci.id = $course_instance_id;
