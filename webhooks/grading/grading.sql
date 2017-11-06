-- BLOCK update_grading_start_time
UPDATE grading_jobs AS gj
SET
    grading_started_at = $start_time
WHERE
    gj.id = $grading_job_id

-- BLOCK get_job_details
SELECT
    (graded_at IS NOT NULL) AS was_graded,
    s3_bucket AS s3_bucket,
    s3_root_key AS s3_root_key
FROM
    grading_jobs
WHERE
    id = $grading_job_id

-- BLOCK update_job_output
UPDATE grading_jobs
SET
    output = $output
WHERE
    id = $grading_job_id
