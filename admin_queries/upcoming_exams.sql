WITH access_rules_with_near_date AS (
    SELECT
        a.id AS assessment_id,
        aar.start_date,
        aar.end_date,
        coalesce(
            array_length(aar.uids, 1),
            (SELECT count(*) FROM enrollments AS e WHERE e.course_instance_id = a.course_instance_id AND e.role = 'Student')
        ) AS student_count
    FROM
        assessment_access_rules AS aar
        JOIN assessments AS a ON (a.id = aar.assessment_id)
    WHERE
        aar.start_date BETWEEN (now() - interval '24 hours') AND (now() + interval '7 days')
        AND aar.end_date > now()
        AND (aar.role IS NULL OR aar.role = 'Student')
        AND aar.credit >= 100
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
    format_date_full_compact(arwnd.start_date, config_select('display_timezone')) AS start_date,
    format_date_full_compact(arwnd.end_date, config_select('display_timezone')) AS end_date,
    format_interval(arwnd.end_date - arwnd.start_date) AS duration,
    arwnd.student_count,
    aq.question_count,
    aq.ext_q_count
FROM
    access_rules_with_near_date AS arwnd
    JOIN assessments AS a ON (a.id = arwnd.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN institutions AS i ON (i.id = c.institution_id)
    JOIN (
        SELECT
            aq.assessment_id,
            count(*) AS question_count,
            count(*) FILTER(WHERE q.external_grading_enabled = TRUE) AS ext_q_count
         FROM assessment_questions AS aq
         JOIN questions q ON (q.id = aq.question_id)
         GROUP BY aq.assessment_id
    ) AS aq ON (a.id = aq.assessment_id)
WHERE
    arwnd.student_count > 100
ORDER BY
    arwnd.start_date,
    i.short_name,
    c.short_name,
    ci.short_name,
    assessment,
    a.id
LIMIT 100;
