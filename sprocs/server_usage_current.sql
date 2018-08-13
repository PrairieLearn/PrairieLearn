DROP FUNCTION IF EXISTS server_usage_current(interval);

CREATE OR REPLACE FUNCTION
    server_usage_current (
        IN current_interval interval,
        OUT user_count integer,
        OUT page_views_per_second double precision,
        OUT submissions_per_second double precision,
        OUT internal_grading_jobs_per_second double precision,
        OUT external_grading_jobs_per_second double precision,
        OUT timestamp_formatted text
    )
AS $$
BEGIN
    SET LOCAL timezone TO 'UTC';
    timestamp_formatted = to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';

    SELECT count(*)
    INTO user_count
    FROM current_pages
    WHERE date > now() - interval '20 minutes';

    SELECT count(*) / extract(epoch from current_interval)
    INTO page_views_per_second
    FROM page_view_logs
    WHERE date > now() - current_interval;

    SELECT count(*) / extract(epoch from current_interval)
    INTO submissions_per_second
    FROM submissions
    WHERE date > now() - current_interval;

    SELECT count(*) / extract(epoch from current_interval)
    INTO internal_grading_jobs_per_second
    FROM grading_jobs
    WHERE
        date > now() - current_interval
        AND grading_method = 'Internal';

    SELECT count(*) / extract(epoch from current_interval)
    INTO external_grading_jobs_per_second
    FROM grading_jobs
    WHERE
        date > now() - current_interval
        AND grading_method = 'External';
END;
$$ LANGUAGE plpgsql VOLATILE;
