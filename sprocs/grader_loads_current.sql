DROP FUNCTION IF EXISTS grader_loads_current(text,interval,integer,double precision,double precision,double precision,text);

CREATE OR REPLACE FUNCTION
    grader_loads_current(
        IN queue_name text,
        IN grader_load_interval interval,   -- how far back to look to estimate current load
        IN history_interval interval,       -- how far back to look to estimate max load
        IN current_capacity_factor double precision, -- how much current capacity to maintain (e.g., 1.5 means 50% more than needed)
        IN history_capacity_factor double precision, -- how much capacity based on historical load
        OUT instance_count integer,         -- current number of graders
        OUT current_jobs double precision,  -- current number of grading jobs in grading
        OUT max_jobs double precision,      -- current grading job capacity (max simultaneous jobs)
        OUT load_perc double precision,     -- current percentage load (0 to 100)
        OUT ungraded_jobs double precision, -- current jobs that have not yet been graded (waiting or in grading)
        OUT history_jobs double precision,  -- max simultaneous jobs in previous history_interval
        OUT desired_instances_by_ungraded_jobs double precision,
        OUT desired_instances_by_current_jobs double precision,
        OUT desired_instances_by_history_jobs double precision,
        OUT desired_instances integer,      -- the actual number of requested grading instances
        OUT timestamp_formatted text
    )
AS $$
DECLARE
    jobs_per_instance double precision;
BEGIN
    -- ######################################################################
    -- get information from the DB about jobs that still need to be graded

    SELECT count(*)
    INTO ungraded_jobs
    FROM grading_jobs
    WHERE
        grading_method = 'External'
        AND grading_request_canceled_at IS NULL
        AND graded_at IS NULL
        AND date > now() - interval '1 hour'; -- ignore very old jobs where something went wrong

    -- ######################################################################
    -- get current information from the grader instances themselves

    SELECT
        count(*),
        coalesce(sum(gl.average_jobs), 0),
        coalesce(sum(gl.max_jobs), 0)
    INTO
        instance_count,
        current_jobs,
        max_jobs
    FROM
        grader_loads AS gl
    WHERE
        gl.queue_name = grader_loads_current.queue_name
        AND (now() - gl.date) < grader_load_interval;

    -- ######################################################################
    -- get recent historical load information

    SELECT coalesce(max(value), 0)
    INTO history_jobs
    FROM time_series
    WHERE
        name = 'current_jobs'
        AND date > now() - history_interval;

    -- ######################################################################
    -- calculate the desired number of graders, using several methodologies

    load_perc := current_jobs / greatest(max_jobs, 1) * 100;
    jobs_per_instance := greatest(max_jobs / greatest(instance_count, 1), 1);
    desired_instances_by_ungraded_jobs := ungraded_jobs / jobs_per_instance;
    desired_instances_by_current_jobs := current_jobs * 1.5 / jobs_per_instance;
    desired_instances_by_history_jobs := history_jobs * 1.5 / jobs_per_instance;
    desired_instances := ceiling(greatest(
        1,
        desired_instances_by_ungraded_jobs,
        desired_instances_by_current_jobs,
        desired_instances_by_history_jobs
    ));

    -- ######################################################################
    -- write data to time_series table

    INSERT INTO time_series (name, value) VALUES ('instance_count', instance_count);
    INSERT INTO time_series (name, value) VALUES ('current_jobs', current_jobs);
    INSERT INTO time_series (name, value) VALUES ('max_jobs', max_jobs);
    INSERT INTO time_series (name, value) VALUES ('load_perc', load_perc);
    INSERT INTO time_series (name, value) VALUES ('ungraded_jobs', ungraded_jobs);
    INSERT INTO time_series (name, value) VALUES ('history_jobs', history_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_ungraded_jobs', desired_instances_by_ungraded_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_current_jobs', desired_instances_by_current_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_history_jobs', desired_instances_by_history_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances', desired_instances);

    -- ######################################################################
    -- timestamp for sending to CloudWatch

    SET LOCAL timezone TO 'UTC';
    timestamp_formatted := to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';
END;
$$ LANGUAGE plpgsql VOLATILE;


