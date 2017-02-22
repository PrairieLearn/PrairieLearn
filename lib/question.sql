-- BLOCK select_issues
SELECT
    i.*,
    format_date_full(i.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date
FROM
    issues AS i
    LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
    JOIN pl_courses AS c ON (c.id = i.course_id)
WHERE
    i.variant_id = $variant_id
    AND i.course_caused
ORDER BY
    i.date;

-- BLOCK select_submissions
SELECT
    s.*,
    gj.id AS grading_job_id,
    grading_job_status(gj.id) AS grading_job_status,
    format_date_full_compact(s.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    CASE
        WHEN s.grading_requested_at IS NOT NULL THEN format_interval($req_date - s.grading_requested_at)
        ELSE NULL
    END AS elapsed_grading_time
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
    LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN questions AS q ON (q.id = v.question_id)
    JOIN pl_courses AS c ON (c.id = q.course_id)
    LEFT JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
WHERE
    v.id = $variant_id
ORDER BY
    s.date DESC;

-- BLOCK select_issues_for_variant
SELECT i.*
FROM issues AS i
WHERE i.variant_id = $variant_id;

-- BLOCK assessment_question_stats
SELECT
    aset.name || ' ' || a.number || ': ' || title AS title,
    ci.short_name AS course_title,
    a.id AS assessment_id,
    aset.color,
    (aset.abbreviation || a.number) as label,
    admin_assessment_question_number(aq.id) as number,
    aq.*
FROM
    assessment_questions AS aq
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    aq.question_id=$question_id
    AND aq.deleted_at IS NULL
GROUP BY
    a.id,
    aq.id,
    aset.id,
    ci.id
ORDER BY
    admin_assessment_question_number(aq.id);
