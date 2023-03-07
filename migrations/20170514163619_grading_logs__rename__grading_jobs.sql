ALTER TABLE IF EXISTS grading_logs
RENAME TO grading_jobs;

ALTER TABLE grading_jobs
RENAME CONSTRAINT "grading_logs_auth_user_id_fkey" TO "grading_jobs_auth_user_id_fkey";

ALTER TABLE grading_jobs
RENAME CONSTRAINT "grading_logs_graded_by_fkey" TO "grading_jobs_graded_by_fkey";

ALTER TABLE grading_jobs
RENAME CONSTRAINT "grading_logs_grading_request_canceled_by_fkey" TO "grading_jobs_grading_request_canceled_by_fkey";

ALTER TABLE grading_jobs
RENAME CONSTRAINT "grading_logs_submission_id_fkey" TO "grading_jobs_submission_id_fkey";

ALTER INDEX IF EXISTS grading_logs_pkey
RENAME TO grading_jobs_pkey;

ALTER INDEX IF EXISTS grading_logs_submission_id_idx
RENAME TO grading_jobs_submission_id_idx;

ALTER SEQUENCE IF EXISTS grading_logs_id_seq
RENAME TO grading_jobs_id_seq;
