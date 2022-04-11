SELECT
    pid,
    age(clock_timestamp(), query_start),
    usename,
    host(client_addr) || ':' || client_port AS client,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY age DESC;
