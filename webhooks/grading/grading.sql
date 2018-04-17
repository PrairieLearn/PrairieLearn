-- BLOCK get_job_details
SELECT
    (graded_at IS NOT NULL) AS was_graded,
    s3_bucket,
    s3_root_key
FROM
    grading_jobs
WHERE
    id = $grading_job_id;
