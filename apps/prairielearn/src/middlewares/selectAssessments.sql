-- BLOCK select_assessments
SELECT
  (aset.abbreviation || a.number) AS assessment_label,
  a.id
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
  ci.id = $course_instance_id
  AND aset.id = $assessment_set_id
  AND a.deleted_at IS NULL
  AND aa.authorized
ORDER BY
  aset.number,
  a.order_by,
  a.id;
