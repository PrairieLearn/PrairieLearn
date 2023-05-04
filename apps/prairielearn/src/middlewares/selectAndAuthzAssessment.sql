-- BLOCK select_and_auth
SELECT
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(am) AS assessment_module,
  to_jsonb(aa) AS authz_result,
  assessment_label (a, aset) AS assessment_label
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
  a.id = $assessment_id
  AND a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL
  AND aa.authorized;
