-- BLOCK log_into_view_log
WITH new_access_id AS (
  INSERT INTO access_logs (date) VALUES ($date)
  RETURNING *
)
INSERT INTO variant_view_logs (access_log_id,variant_id) VALUES ((SELECT id FROM new_access_id),$variant_id)
RETURNING variant_view_logs.id;
