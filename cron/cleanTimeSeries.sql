-- BLOCK clean_time_series
WITH selected_ids AS (
    SELECT id
    FROM time_series
    WHERE date < now() - make_interval(secs => $retention_period_sec)
    LIMIT $limit
)
DELETE FROM time_series AS ts
USING selected_ids
WHERE ts.id = selected_ids.id;
