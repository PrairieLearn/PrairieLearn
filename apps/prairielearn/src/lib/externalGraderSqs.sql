-- BLOCK update_s3_info
UPDATE grading_jobs
SET
  s3_bucket = $s3_bucket,
  s3_root_key = $s3_root_key
WHERE
  id = $grading_job_id
