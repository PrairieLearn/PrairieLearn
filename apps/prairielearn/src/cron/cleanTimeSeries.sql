-- BLOCK clean_time_series
DELETE FROM time_series
WHERE
  date < now() - make_interval(secs => $retention_period_sec);
