DROP FUNCTION IF EXISTS grading_jobs_stats_day();

CREATE OR REPLACE FUNCTION
    grading_jobs_stats_day(
        OUT count bigint,
        OUT delta_total double precision,
        OUT delta_submitted_at double precision,
        OUT delta_started_at double precision,
        OUT delta_finished_at double precision,
        OUT delta_final double precision
    )
AS $$
BEGIN
    WITH recent_jobs AS (
        SELECT
            extract(epoch from (graded_at - grading_requested_at)) AS delta_total,
            extract(epoch from (grading_submitted_at - grading_requested_at)) AS delta_submitted_at,
            extract(epoch from (grading_started_at - grading_submitted_at)) AS delta_started_at,
            extract(epoch from (grading_finished_at - grading_started_at)) AS delta_finished_at,
            extract(epoch from (graded_at - grading_finished_at)) AS delta_final
        FROM
            grading_jobs
        WHERE
            grading_requested_at >= now() - '1 day'::interval
            AND grading_method = 'External'
    )
    SELECT
        count(*)::bigint,
        coalesce(avg(rj.delta_total), 0)::double precision,
        coalesce(avg(rj.delta_submitted_at), 0)::double precision,
        coalesce(avg(rj.delta_started_at), 0)::double precision,
        coalesce(avg(rj.delta_finished_at), 0)::double precision,
        coalesce(avg(rj.delta_final), 0)::double precision
    INTO
        count,
        delta_total,
        delta_submitted_at,
        delta_started_at,
        delta_finished_at,
        delta_final
    FROM
        recent_jobs AS rj;
END;
$$ LANGUAGE plpgsql STABLE;
