-- BLOCK insert_load
INSERT INTO grader_loads
    ( instance_id,  queue_name,  average_jobs,  max_jobs)
VALUES
    ($instance_id, $queue_name, $average_jobs, $max_jobs)
ON CONFLICT (instance_id) DO UPDATE
SET
    queue_name = EXCLUDED.queue_name,
    average_jobs = EXCLUDED.average_jobs,
    max_jobs = EXCLUDED.max_jobs;
