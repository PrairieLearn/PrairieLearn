-- BLOCK insert_load
INSERT INTO server_loads
    ( instance_id,  group_name,  average_jobs,  max_jobs)
VALUES
    ($instance_id, $group_name, $average_jobs, $max_jobs)
ON CONFLICT (instance_id) DO UPDATE
SET
    date = now(),
    group_name = EXCLUDED.group_name,
    average_jobs = EXCLUDED.average_jobs,
    max_jobs = EXCLUDED.max_jobs;
