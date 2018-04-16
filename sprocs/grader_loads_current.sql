DROP FUNCTION IF EXISTS grader_loads_current(text,interval);
DROP FUNCTION IF EXISTS grader_loads_current(text,interval,interval,double precision, double precision);
DROP FUNCTION IF EXISTS grader_loads_current(text,interval,interval,double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION
    grader_loads_current(
        IN queue_name text,
        IN grader_load_interval interval,   -- how far back to look to estimate current load
        IN history_interval interval,       -- how far back to look to estimate max load
        IN current_capacity_factor double precision, -- how much current capacity to maintain (e.g., 1.5 means 50% more than needed)
        IN history_capacity_factor double precision, -- how much capacity based on historical load
        IN seconds_per_submission_per_user double precision, -- predicted time between submissions for each user
        OUT instance_count integer,         -- current number of graders
        OUT current_jobs double precision,  -- current number of grading jobs in grading
        OUT max_jobs double precision,      -- current grading job capacity (max simultaneous jobs)
        OUT load_perc double precision,     -- current percentage load (0 to 100)
        OUT ungraded_jobs double precision, -- current jobs that have not yet been graded (waiting or in grading)
        OUT age_of_oldest_job_sec double precision, -- time since creation of oldest job
        OUT history_jobs double precision,  -- max simultaneous jobs in previous history_interval
        OUT current_users integer,          -- current number of users viewing externally graded questions
        OUT predicted_jobs_by_current_users double precision, -- estimated jobs based on active users
        OUT jobs_per_instance double precision, -- estimated jobs that run per grader instance
        OUT desired_instances_by_ungraded_jobs double precision,
        OUT desired_instances_by_current_jobs double precision,
        OUT desired_instances_by_history_jobs double precision,
        OUT desired_instances_by_current_users double precision,
        OUT desired_instances integer,      -- the actual number of requested grading instances
        OUT timestamp_formatted text
    )
AS $$
BEGIN
    -- ######################################################################
    -- get information from the DB about jobs that still need to be graded

    SELECT
        count(*),
        coalesce(max(extract(epoch FROM now() - gj.date)), 0)
    INTO
        ungraded_jobs,
        age_of_oldest_job_sec
    FROM grading_jobs AS gj
    WHERE
        gj.grading_method = 'External'
        AND gj.grading_request_canceled_at IS NULL
        AND gj.graded_at IS NULL
        AND gj.date > now() - interval '1 hour'; -- ignore very old jobs where something went wrong

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
    -- get user counts on externally graded questions

    WITH
    -- first determine the number of users currently looking at an externally-graded question
    current_external_questions AS (
        SELECT
            q.id AS question_id,
            count(*) AS user_count
        FROM
            current_pages AS cp
            JOIN questions AS q ON (q.id = cp.question_id)
        WHERE
            cp.date > now() - interval '1 hour'
            AND q.grading_method = 'External'
        GROUP BY q.id
    ),
    -- next determine the average grading time for each of these questions
    average_grading_times AS (
        SELECT
            ceq.question_id,
            avg(gj.grading_finished_at - gj.grading_started_at) AS grading_duration
        FROM
            current_external_questions AS ceq
            JOIN variants AS v ON (v.question_id = ceq.question_id)
            JOIN submissions AS s ON (s.variant_id = v.id)
            JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
        WHERE
            gj.date > now() - interval '1 day'
            AND gj.graded_at IS NOT NULL
        GROUP BY ceq.question_id
    )
    SELECT
        coalesce(sum(ceq.user_count), 0),
        coalesce(sum(
            ceq.user_count
            / seconds_per_submission_per_user
            * coalesce(extract(epoch FROM agt.grading_duration), 10) -- use 10 s if we don't have any data
        ), 0)
    INTO
        current_users,
        predicted_jobs_by_current_users
    FROM
        current_external_questions AS ceq
        LEFT JOIN average_grading_times AS agt ON (agt.question_id = ceq.question_id);

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
    desired_instances_by_current_jobs := current_jobs * current_capacity_factor / jobs_per_instance;
    desired_instances_by_history_jobs := history_jobs * history_capacity_factor / jobs_per_instance;
    desired_instances_by_current_users := predicted_jobs_by_current_users / jobs_per_instance;
    desired_instances := ceiling(greatest(
        1,
        desired_instances_by_ungraded_jobs,
        desired_instances_by_current_jobs,
        desired_instances_by_history_jobs,
        desired_instances_by_current_users
    ));

    -- ######################################################################
    -- write data to time_series table

    INSERT INTO time_series (name, value) VALUES ('instance_count', instance_count);
    INSERT INTO time_series (name, value) VALUES ('current_jobs', current_jobs);
    INSERT INTO time_series (name, value) VALUES ('max_jobs', max_jobs);
    INSERT INTO time_series (name, value) VALUES ('load_perc', load_perc);
    INSERT INTO time_series (name, value) VALUES ('ungraded_jobs', ungraded_jobs);
    INSERT INTO time_series (name, value) VALUES ('history_jobs', history_jobs);
    INSERT INTO time_series (name, value) VALUES ('current_users', current_users);
    INSERT INTO time_series (name, value) VALUES ('predicted_jobs_by_current_users', predicted_jobs_by_current_users);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_ungraded_jobs', desired_instances_by_ungraded_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_current_jobs', desired_instances_by_current_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_history_jobs', desired_instances_by_history_jobs);
    INSERT INTO time_series (name, value) VALUES ('desired_instances_by_current_users', desired_instances_by_current_users);
    INSERT INTO time_series (name, value) VALUES ('desired_instances', desired_instances);

    -- ######################################################################
    -- timestamp for sending to CloudWatch

    SET LOCAL timezone TO 'UTC';
    timestamp_formatted := to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';
END;
$$ LANGUAGE plpgsql VOLATILE;


