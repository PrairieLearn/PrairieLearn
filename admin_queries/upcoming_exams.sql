WITH assessments_with_near_date AS (
    SELECT DISTINCT ON (a.id)
        a.id AS assessment_id,
        aar.start_date,
        aar.end_date
    FROM
        assessment_access_rules AS aar
        JOIN assessments AS a ON (a.id = aar.assessment_id)
    WHERE
        aar.start_date BETWEEN (now() - interval '12 hours') AND (now() + interval '7 days')
        AND (aar.role IS NULL OR aar.role = 'Student')
        AND aar.credit > 100
        AND a.type = 'Exam'
    ORDER BY a.id, aar.start_date
)
SELECT
    i.short_name AS institution,
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,
    aset.abbreviation || a.number || ': ' || a.title AS assessment,
    a.id AS assessment_id,
    format_date_full_compact(awnd.start_date, config_select('display_timezone')) as start_date,
    format_date_full_compact(awnd.end_date, config_select('display_timezone')) as end_date,
    (SELECT count(*) FROM enrollments AS e WHERE e.course_instance_id = ci.id AND e.role = 'Student') as enrollments
FROM
    assessments_with_near_date AS awnd
    JOIN assessments AS a ON (a.id = awnd.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN institutions AS i ON (i.id = c.institution_id)
ORDER BY awnd.start_date
LIMIT 100;
