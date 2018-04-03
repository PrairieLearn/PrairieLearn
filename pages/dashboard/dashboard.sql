-- BLOCK current_assessments
SELECT aar.*,a.title,c.short_name,ci.long_name FROM assessment_access_rules AS aar
JOIN assessments AS a ON (a.id = aar.assessment_id)
JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE $req_date::timestamp BETWEEN start_date AND end_date
AND (role='Student' OR role IS NULL)
ORDER BY c.short_name,a.number,aar.number
