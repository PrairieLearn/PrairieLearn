-- Add columns to store bucket and root key for this grading job, as well as
-- any output produced by the program
ALTER TABLE grading_jobs
ADD COLUMN grading_received_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE grading_jobs
ADD COLUMN s3_bucket text;

ALTER TABLE grading_jobs
ADD COLUMN s3_root_key text;

ALTER TABLE grading_jobs
ADD COLUMN output text;
