CREATE FUNCTION
    server_loads_current (
        IN group_name text,
        IN current_interval interval
    ) RETURNS TABLE (
        job_type text,
        instance_count integer,
        current_jobs double precision,
        max_jobs double precision,
        load_perc double precision,
        measured_at timestamp with time zone
    )
AS $$
DECLARE
    r RECORD;
BEGIN
    measured_at = now();

    FOR r IN
        SELECT
            gl.job_type,
            count(*) AS instance_count,
            coalesce(sum(gl.average_jobs), 0) AS current_jobs,
            coalesce(sum(gl.max_jobs), 0) AS max_jobs
        FROM
            server_loads AS gl
        WHERE
            gl.group_name = server_loads_current.group_name
            AND (now() - gl.date) < current_interval
        GROUP BY
            gl.job_type
    LOOP
        job_type := r.job_type;
        instance_count := r.instance_count;
        current_jobs := r.current_jobs;
        max_jobs := r.max_jobs;
        
        IF max_jobs <= 0 THEN
            load_perc := 0;
        ELSE
            load_perc := current_jobs / max_jobs * 100;
        END IF;

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
