ALTER TABLE question_score_logs
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN grading_job_id bigint REFERENCES grading_jobs ON UPDATE CASCADE ON DELETE CASCADE;
