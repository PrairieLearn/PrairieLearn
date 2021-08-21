-- BLOCK select_and_auth
SELECT
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(au) AS assessment_unit,
    to_jsonb(aa) AS authz_result,
    assessment_label(a, aset) AS assessment_label
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN assessment_units AS au ON (au.id = a.assessment_unit_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
    a.id = $assessment_id
    AND a.course_instance_id = $course_instance_id
    AND aa.authorized;
