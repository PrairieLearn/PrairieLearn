-- BLOCK assessment
SELECT
    a.*,
    cta.credit,
    cta.credit_date_string,
    cta.access_rules
FROM
    assessments AS a,
    users AS u,
    LATERAL check_assessment_access(a.id, $mode::enum_mode, $role::enum_role, u.uid, current_timestamp) AS cta
WHERE
    a.id = $assessment_id
    AND u.id = $user_id
    AND a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id
    AND cta.available;

-- BLOCK assessment_set
SELECT aset.*
FROM assessments as a
JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE a.id = $assessment_id
AND a.course_instance_id = $course_instance_id;
