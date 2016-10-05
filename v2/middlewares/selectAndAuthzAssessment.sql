-- BLOCK select_and_auth
SELECT
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(aa) AS authz_assessment
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN LATERAL authz_assessment(a.id, $authz_data) AS aa ON TRUE
WHERE
    a.id = $assessment_id
    AND a.course_instance_id = $course_instance_id
    AND aa.authorized;
