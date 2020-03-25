SELECT c.short_name,ci.long_name,a.title,
    a.id as assessment_id,
    a.course_instance_id,
    ci.course_id,
    aar.start_date,
    aar.end_date,
    aar.end_date - aar.start_date AS duration,
    aar.role,
    aar.uids,
    (SELECT count(*) FROM enrollments WHERE course_instance_id=ci.id AND role='Student') as enrollments
FROM assessment_access_rules AS aar
JOIN assessments AS a ON (a.id = aar.assessment_id)
JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE start_date BETWEEN $req_date::timestamp AND $req_date::timestamp + interval '7 days'
AND (role='Student' OR role IS NULL)
AND c.short_name != 'XC 101' AND c.short_name != 'QA 101'
ORDER BY c.short_name,a.number,aar.number
;
