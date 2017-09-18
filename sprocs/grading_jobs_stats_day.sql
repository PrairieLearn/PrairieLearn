CREATE OR REPLACE FUNCTION
    grading_jobs_stats_day()
    RETURNS TABLE(count bigint, average_duration real, total_duration real) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS count,
        AVG(EXTRACT(EPOCH FROM (graded_at - grading_requested_at)))::real AS average_duration,
        SUM(EXTRACT(EPOCH FROM (graded_at - grading_requested_at)))::real AS total_duration
    FROM
        grading_jobs
    WHERE
        grading_requested_at >= NOW() - '1 day'::INTERVAL
        AND grading_method = 'External';
END;
$$ LANGUAGE plpgsql STABLE;
