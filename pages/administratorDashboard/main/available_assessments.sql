SELECT c.short_name,ci.long_name,a.title,
    a.id as assessment_id,
    a.course_instance_id,
    ci.course_id,
    format_date_full_compact(aar.end_date, $timezone) as start_date,
    aar.end_date,
    aar.end_date - aar.start_date AS duration,
    aar.role,
    aar.uids,
    (SELECT count(*) FROM enrollments WHERE course_instance_id=ci.id AND role='Student') as enrollments
--    to_jsonb(aar.*) as aar_json,
--    to_json(a.*) as a_json

FROM assessment_access_rules AS aar
JOIN assessments AS a ON (a.id = aar.assessment_id)
JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE $req_date::timestamp BETWEEN start_date AND end_date
AND (role='Student' OR role IS NULL)
AND c.short_name != 'XC 101' AND c.short_name != 'QA 101'
ORDER BY c.short_name,a.number,aar.number
;
