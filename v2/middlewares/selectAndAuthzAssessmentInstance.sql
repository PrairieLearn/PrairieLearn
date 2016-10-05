-- BLOCK select_and_auth
SELECT
    to_jsonb(ai) AS assessment_instance,
    format_interval(aid.duration) AS assessment_instance_duration,
    to_jsonb(u) AS instance_user,
    to_jsonb(e) AS instance_enrollment,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(aai) AS authz_assessment_instance
FROM
    assessment_instances AS ai
    LEFT JOIN assessment_instance_durations AS aid ON (aid.id = ai.id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN users AS u ON (u.id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = ci.id)
    JOIN LATERAL authz_assessment_instance(ai.id, $authz_data) AS aai ON TRUE
WHERE
    ai.id = $assessment_instance_id
    AND ci.id = $course_instance_id
    AND aai.authorized;
