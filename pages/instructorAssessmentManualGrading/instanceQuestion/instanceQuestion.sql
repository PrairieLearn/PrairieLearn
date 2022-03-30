-- BLOCK select_grading_job_data
SELECT
    gj.*,
    gj.score * 100 AS score_perc
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
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
