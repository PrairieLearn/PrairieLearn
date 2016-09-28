-- BLOCK select_and_auth
SELECT
    to_jsonb(c) AS course,
    to_jsonb(ci) AS course_instance,
    to_jsonb(aaci) AS auth,
    to_jsonb(auth_u) AS auth_user,
    to_jsonb(auth_e) AS auth_enrollment,
    all_courses(auth_u.id) AS all_courses,
    all_course_instances(c.id, auth_u.id) AS all_course_instances
FROM
    course_instances AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
    JOIN LATERAL auth_admin_course_instance(ci.id, 'View', $auth_data) AS aaci ON TRUE
    JOIN users AS auth_u ON (auth_u.id = aaci.auth_user_id)
    JOIN enrollments AS auth_e ON (auth_e.user_id = auth_u.id AND auth_e.course_instance_id = ci.id)
WHERE
    ci.id = $course_instance_id
    AND aaci.authorized;

-- BLOCK select_assessments
SELECT
    a.id,a.tid,a.course_instance_id,a.type,
    a.number as assessment_number,a.title,a.assessment_set_id,
    tstats.number,tstats.mean,tstats.std,tstats.min,tstats.max,
    tstats.median,tstats.n_zero,tstats.n_hundred,
    tstats.n_zero_perc,n_hundred_perc,tstats.score_hist,
    dstats.mean AS mean_duration,format_interval(dstats.median) AS median_duration,
    dstats.min AS min_duration,dstats.max AS max_duration,
    aset.abbrev,aset.name,aset.heading,aset.color,
    (aset.abbrev || a.number) as label,
    (lag(aset.id) OVER (PARTITION BY aset.id ORDER BY a.number, a.id) IS NULL) AS start_new_set
FROM assessments AS a
LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
LEFT JOIN assessment_stats AS tstats ON (tstats.id = a.id)
LEFT JOIN assessment_duration_stats AS dstats ON (dstats.id = a.id)
WHERE a.course_instance_id = $course_instance_id
AND a.deleted_at IS NULL
ORDER BY (aset.number, a.number, a.id);
