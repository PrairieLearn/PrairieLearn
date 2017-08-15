-- BLOCK select_errors
SELECT
    e.*,
    format_date_full(e.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date
FROM
    errors AS e
    LEFT JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    JOIN pl_courses AS c ON (c.id = e.course_id)
WHERE
    e.variant_id = $variant_id
    AND e.course_caused
ORDER BY
    e.date;

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

-- BLOCK select_errors_for_variant
SELECT e.*
FROM errors AS e
WHERE e.variant_id = $variant_id;
