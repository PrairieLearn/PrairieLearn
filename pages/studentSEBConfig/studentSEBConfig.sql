-- BLOCK select_and_auth
SELECT
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(aa) AS authz_result,
    assessment_label(a, aset) AS assessment_label,
    to_jsonb(ci) AS course_instance,
    to_jsonb(c) AS course
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
    a.id = $assessment_id
    AND a.course_instance_id = $course_instance_id
    AND aa.authorized;
