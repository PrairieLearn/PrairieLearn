-- BLOCK update_grading_received_time
UPDATE grading_jobs AS gj
SET
    grading_received_at = $received_time
WHERE
    gj.id = $grading_job_id;

-- BLOCK get_job_details
SELECT
    (graded_at IS NOT NULL) AS was_graded,
    s3_bucket,
    s3_root_key
FROM
    grading_jobs
WHERE
    id = $grading_job_id;
