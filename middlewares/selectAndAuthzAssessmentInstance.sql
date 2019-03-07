-- BLOCK select_and_auth
WITH assessment_file_list AS (
    SELECT coalesce(jsonb_agg(af), '[]'::jsonb) AS list
    FROM assessment_files AS af
    WHERE
        af.assessment_instance_id = $assessment_instance_id
        AND af.deleted_at IS NULL
)
SELECT
    to_jsonb(ai) AS assessment_instance,
    CASE
        WHEN ai.date_limit IS NULL THEN NULL
        ELSE floor(extract(epoch from (ai.date_limit - $req_date::timestamptz)) * 1000)
    END AS assessment_instance_remaining_ms,
    CASE
        WHEN ai.date_limit IS NULL THEN NULL
        ELSE floor(extract(epoch from (ai.date_limit - ai.date)) * 1000)
    END AS assessment_instance_time_limit_ms,
    to_jsonb(u) AS instance_user,
    coalesce(to_jsonb(e), '{}'::jsonb) AS instance_enrollment,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(aai) AS authz_result,
    assessment_instance_label(ai, a, aset) AS assessment_instance_label,
    assessment_label(a, aset) AS assessment_label,
    afl.list AS assessment_file_list
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    JOIN LATERAL authz_assessment_instance(ai.id, $authz_data, $req_date, ci.display_timezone) AS aai ON TRUE
    CROSS JOIN assessment_file_list AS afl
WHERE
    ai.id = $assessment_instance_id
    AND ci.id = $course_instance_id
    AND aai.authorized;
