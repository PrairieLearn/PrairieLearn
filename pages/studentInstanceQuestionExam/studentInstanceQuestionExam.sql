-- BLOCK get_variant
SELECT
    v.*
FROM
    variants AS v
WHERE
    v.instance_question_id = $instance_question_id
ORDER BY v.date DESC
LIMIT 1;

-- BLOCK select_submissions
SELECT
    s.*,
    gl.id AS grading_log_id,
    grading_log_status(gl.id) AS grading_log_status,
    format_date_full_compact(s.date, ci.display_timezone) AS formatted_date,
    CASE
        WHEN s.grading_requested_at IS NOT NULL THEN format_interval($req_date - s.grading_requested_at)
        ELSE NULL
    END AS elapsed_grading_time
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN grading_logs AS gl ON (gl.submission_id = s.id)
WHERE
    v.id = $variant_id
ORDER BY
    s.date DESC;
