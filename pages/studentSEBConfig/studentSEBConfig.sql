-- BLOCK select_assessment
SELECT
    *,ci.short_name AS ci_short_name
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses as c ON (c.id = ci.course_id)
WHERE
    a.id = $assessment_id
;
