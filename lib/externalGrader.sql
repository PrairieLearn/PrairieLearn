-- BLOCK select_grading_job_info
SELECT
    to_jsonb(gj.*) AS grading_job,
    to_jsonb(s.*) AS submission,
    to_jsonb(v.*) AS variant,
    to_jsonb(q.*) AS question,
    to_jsonb(c.*) AS course
FROM
    grading_jobs AS gj
    LEFT JOIN submissions AS s ON (s.id = gj.submission_id)
    LEFT JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN questions AS q ON (q.id = v.question_id)
    LEFT JOIN pl_courses AS c ON (c.id = q.course_id)
WHERE
    gj.id = $grading_job_id;

-- BLOCK update_grading_submitted_time
UPDATE grading_jobs AS gj
SET
    grading_submitted_at = $grading_submitted_at
WHERE
    gj.id = $grading_job_id;

-- BLOCK update_grading_received_time
UPDATE grading_jobs AS gj
SET
    grading_received_at = $grading_received_at
WHERE
    gj.id = $grading_job_id;
