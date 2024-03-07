ALTER TABLE question_score_logs
ADD COLUMN grading_job_id bigint REFERENCES grading_jobs ON UPDATE CASCADE ON DELETE CASCADE;
