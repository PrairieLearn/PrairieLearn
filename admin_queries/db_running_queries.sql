SELECT
    pid,
    age(clock_timestamp(), query_start),
    usename,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY age DESC;
