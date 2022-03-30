-- BLOCK select_grading_job_data
SELECT
    gj.*,
    gj.score * 100 AS score_perc,
    COALESCE(u.name, u.uid) AS grader_name,
    format_date_short(gj.date, coalesce(ci.display_timezone, c.display_timezone)) AS grading_date_formatted
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
    JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
    gj.id = $grading_job_id
    AND v.instance_question_id = $instance_question_id;

-- BLOCK select_graders
SELECT to_jsonb(course_instances_select_graders($course_instance_id)) AS graders;

-- BLOCK update_assigned_grader
UPDATE instance_questions AS iq
SET
    requires_manual_grading = CASE WHEN $assigned_grader::BIGINT IS NOT NULL THEN TRUE ELSE requires_manual_grading END,
    assigned_grader = $assigned_grader
WHERE
    iq.id = $instance_question_id
    AND ($assigned_grader::BIGINT IS NULL
         OR $assigned_grader IN (SELECT user_id FROM UNNEST(course_instances_select_graders($course_instance_id))));
