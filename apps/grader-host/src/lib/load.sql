-- BLOCK insert_load
INSERT INTO
  grader_loads (
    instance_id,
    queue_name,
    average_jobs,
    max_jobs,
    lifecycle_state,
    healthy
  )
VALUES
  (
    $instance_id,
    $queue_name,
    $average_jobs,
    $max_jobs,
    $lifecycle_state,
    $healthy
  )
ON CONFLICT (instance_id) DO
UPDATE
SET
  date = now(),
  queue_name = EXCLUDED.queue_name,
  average_jobs = EXCLUDED.average_jobs,
  max_jobs = EXCLUDED.max_jobs,
  lifecycle_state = EXCLUDED.lifecycle_state,
  healthy = EXCLUDED.healthy;

-- BLOCK insert_config
INSERT INTO
  grader_loads (
    instance_id,
    queue_name,
    average_jobs,
    max_jobs,
    config,
    started_at
  )
VALUES
  (
    $instance_id,
    $queue_name,
    $average_jobs,
    $max_jobs,
    $config,
    now()
  )
ON CONFLICT (instance_id) DO
UPDATE
SET
  date = now(),
  queue_name = EXCLUDED.queue_name,
  average_jobs = EXCLUDED.average_jobs,
  max_jobs = EXCLUDED.max_jobs,
  config = EXCLUDED.config,
  started_at = EXCLUDED.started_at;
