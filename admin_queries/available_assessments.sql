SELECT
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,
    aset.abbreviation || a.number AS assessment,
    a.id AS assessment_id,
    format_date_full_compact(aar.start_date, config_select('display_timezone')) as start_date,
    format_date_full_compact(aar.end_date, config_select('display_timezone')) as end_date,
    array_length(aar.uids, 1) AS uids_count,
    aar.credit,
    CASE WHEN aar.exam_uuid IS NOT NULL THEN 'yes' ELSE NULL END AS exam_uuid,
    aar.mode,
    aar.password,
    CASE WHEN aar.seb_config IS NOT NULL THEN 'yes' ELSE NULL END AS seb_config,
    aar.show_closed_assessment,
    aar.time_limit_min,
    (SELECT count(*) FROM enrollments WHERE course_instance_id=ci.id AND role='Student') as enrollments
FROM
    assessment_access_rules AS aar
    JOIN assessments AS a ON (a.id = aar.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
    (aar.start_date IS NULL OR now() > aar.start_date)
    AND (aar.end_date IS NULL OR now() < aar.end_date)
    AND (aar.role = 'Student' OR aar.role IS NULL)
    AND c.short_name != 'XC 101' AND c.short_name != 'QA 101'
ORDER BY
    c.short_name,ci.short_name, a.number,aar.number;
