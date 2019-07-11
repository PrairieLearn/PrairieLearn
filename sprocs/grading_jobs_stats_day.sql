DROP FUNCTION IF EXISTS grading_jobs_stats_day();
DROP FUNCTION IF EXISTS grading_jobs_stats_day(bigint,double precision,double precision,double precision,double precision,double precision);
DROP FUNCTION IF EXISTS grading_jobs_stats_day(bigint,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision);

CREATE OR REPLACE FUNCTION
    grading_jobs_stats_day(
        OUT count bigint,
        OUT delta_total double precision,
        OUT delta_submitted_at double precision,
        OUT delta_received_at double precision,
        OUT delta_started_at double precision,
        OUT delta_finished_at double precision,
        OUT delta_final double precision,
        OUT max_total double precision,
        OUT max_submitted_at double precision,
        OUT max_received_at double precision,
        OUT max_started_at double precision,
        OUT max_finished_at double precision,
        OUT max_final double precision
    )
AS $$
BEGIN
    WITH recent_jobs AS (
        SELECT
            extract(epoch from (gj.graded_at - gj.grading_requested_at)) AS delta_total,
            extract(epoch from (gj.grading_submitted_at - gj.grading_requested_at)) AS delta_submitted_at,
            extract(epoch from (gj.grading_received_at - gj.grading_submitted_at)) AS delta_received_at,
            extract(epoch from (gj.grading_started_at - gj.grading_received_at)) AS delta_started_at,
            extract(epoch from (gj.grading_finished_at - gj.grading_started_at)) AS delta_finished_at,
            extract(epoch from (gj.graded_at - gj.grading_finished_at)) AS delta_final
        FROM
            grading_jobs as gj
        WHERE
            gj.date >= now() - '1 day'::interval
            AND gj.grading_method = 'External'
    )
    SELECT
        count(*)::bigint,
        coalesce(avg(rj.delta_total), 0)::double precision,
        coalesce(avg(rj.delta_submitted_at), 0)::double precision,
        coalesce(avg(rj.delta_received_at), 0)::double precision,
        coalesce(avg(rj.delta_started_at), 0)::double precision,
        coalesce(avg(rj.delta_finished_at), 0)::double precision,
        coalesce(avg(rj.delta_final), 0)::double precision,
        coalesce(max(rj.delta_total), 0)::double precision,
        coalesce(max(rj.delta_submitted_at), 0)::double precision,
        coalesce(max(rj.delta_received_at), 0)::double precision,
        coalesce(max(rj.delta_started_at), 0)::double precision,
        coalesce(max(rj.delta_finished_at), 0)::double precision,
        coalesce(max(rj.delta_final), 0)::double precision
    INTO
        count,
        delta_total,
        delta_submitted_at,
        delta_received_at,
        delta_started_at,
        delta_finished_at,
        delta_final,
        max_total,
        max_submitted_at,
        max_received_at,
        max_started_at,
        max_finished_at,
        max_final
    FROM
        recent_jobs AS rj;
END;
$$ LANGUAGE plpgsql STABLE;
