-- BLOCK clean_time_series
DELETE FROM time_series WHERE date < now() - interval '24 hours';
