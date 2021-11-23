CREATE FUNCTION
    grader_loads_current(
        IN queue_name text,
        IN grader_load_interval interval,   -- how far back to look to estimate current load
        IN history_interval interval,       -- how far back to look to estimate max load
        IN current_capacity_factor double precision, -- how much current capacity to maintain (e.g., 1.5 means 50% more than needed)
        IN history_capacity_factor double precision, -- how much capacity based on historical load
        OUT instance_count integer,         -- current number of graders
        OUT instance_count_launching integer, -- number of healthy graders in process of launching
        OUT instance_count_in_service integer, -- number of healthy, in-service graders
        OUT instance_count_abandoning_launch integer, -- number of graders in process of abandoning launch
        OUT instance_count_unhealthy integer, -- number of unhealthy graders
        OUT current_jobs double precision,  -- current number of grading jobs in grading
        OUT max_jobs double precision,      -- current grading job capacity (max simultaneous jobs)
        OUT load_perc double precision,     -- current percentage load (0 to 100)
        OUT ungraded_jobs double precision, -- current jobs that have not yet been graded (waiting or in grading)
        OUT ungraded_jobs_in_submit double precision, -- current jobs in phase "submit"
        OUT ungraded_jobs_in_queue double precision, -- current jobs in phase "queue"
        OUT ungraded_jobs_in_prepare double precision, -- current jobs in phase "prepare"
        OUT ungraded_jobs_in_run double precision, -- current jobs in phase "run"
        OUT ungraded_jobs_in_report double precision, -- current jobs in phase "report"
        OUT age_of_oldest_job_sec double precision, -- time since creation of oldest job
        OUT age_of_oldest_job_in_submit_sec double precision, -- longest time of jobs currently in "submit" phase
        OUT age_of_oldest_job_in_queue_sec double precision, -- longest time of jobs currently in "queue" phase
        OUT age_of_oldest_job_in_prepare_sec double precision, -- longest time of jobs currently in "prepare" phase
        OUT age_of_oldest_job_in_run_sec double precision, -- longest time of jobs currently in "run" phase
        OUT age_of_oldest_job_in_report_sec double precision, -- longest time of jobs currently in "report" phase
        OUT history_jobs double precision,  -- max simultaneous jobs in previous history_interval
        OUT current_users integer,          -- current number of users viewing externally graded questions
        OUT grading_jobs_per_user double precision, -- current grading jobs per user
        OUT average_grading_jobs_per_user double precision, -- average grading jobs per user over recent history
        OUT history_grading_jobs_per_user double precision, -- max average grading jobs per user in previous history_interval
        OUT predicted_jobs_by_current_users double precision, -- estimated jobs based on active users
        OUT predicted_jobs_by_history_users double precision, -- estimated jobs based on historical active users
        OUT jobs_per_instance double precision, -- estimated jobs that run per grader instance
        OUT desired_instances_by_ungraded_jobs double precision,
        OUT desired_instances_by_current_jobs double precision,
        OUT desired_instances_by_history_jobs double precision,
        OUT desired_instances_by_current_users double precision,
        OUT desired_instances_by_history_users double precision,
        OUT desired_instances_current integer,  -- instantaneous number of requested grading instances
        OUT desired_instances_history integer,  -- max of historical values
        OUT desired_instances integer,          -- the actual number of requested grading instances
        OUT timestamp_formatted text
    )
AS $$
DECLARE
    external_grading_jobs_per_second double precision;
BEGIN
    -- ######################################################################
    -- get information from the DB about jobs that still need to be graded

    SELECT
        coalesce(max(DATE_PART('epoch', now() - gj.date)), 0),
        coalesce(max(DATE_PART('epoch', now() - gj.grading_requested_at)) FILTER (WHERE gj.grading_submitted_at IS NULL), 0),
        coalesce(max(DATE_PART('epoch', now() - gj.grading_submitted_at)) FILTER (WHERE gj.grading_received_at IS NULL), 0),
        coalesce(max(DATE_PART('epoch', now() - gj.grading_received_at)) FILTER (WHERE gj.grading_started_at IS NULL), 0),
        coalesce(max(DATE_PART('epoch', now() - gj.grading_started_at)) FILTER (WHERE gj.grading_finished_at IS NULL), 0),
        coalesce(max(DATE_PART('epoch', now() - gj.grading_finished_at)) FILTER (WHERE gj.graded_at IS NULL), 0),
        -- number of jobs in-flight in different phases
        count(*),
        count(*) FILTER (WHERE gj.grading_submitted_at IS NULL AND gj.grading_requested_at IS NOT NULL),
        count(*) FILTER (WHERE gj.grading_received_at IS NULL AND gj.grading_submitted_at IS NOT NULL),
        count(*) FILTER (WHERE gj.grading_started_at IS NULL AND gj.grading_received_at IS NOT NULL),
        count(*) FILTER (WHERE gj.grading_finished_at IS NULL AND gj.grading_started_at IS NOT NULL),
        count(*) FILTER (WHERE gj.graded_at IS NULL AND gj.grading_finished_at IS NOT NULL)
    INTO
        age_of_oldest_job_sec,
        age_of_oldest_job_in_submit_sec,
        age_of_oldest_job_in_queue_sec,
        age_of_oldest_job_in_prepare_sec,
        age_of_oldest_job_in_run_sec,
        age_of_oldest_job_in_report_sec,
        ungraded_jobs,
        ungraded_jobs_in_submit,
        ungraded_jobs_in_queue,
        ungraded_jobs_in_prepare,
        ungraded_jobs_in_run,
        ungraded_jobs_in_report
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
        count(*) FILTER (WHERE gl.healthy AND gl.lifecycle_state = 'Launching'),
        count(*) FILTER (WHERE gl.healthy AND gl.lifecycle_state = 'InService'),
        count(*) FILTER (WHERE gl.lifecycle_state = 'AbandoningLaunch'),
        count(*) FILTER (WHERE NOT gl.healthy),
        coalesce(sum(gl.average_jobs), 0),
        coalesce(sum(gl.max_jobs) FILTER (WHERE gl.healthy AND gl.lifecycle_state = 'InService'), 0)
    INTO
        instance_count,
        instance_count_launching,
        instance_count_in_service,
        instance_count_abandoning_launch,
        instance_count_unhealthy,
        current_jobs,
        max_jobs
    FROM
        grader_loads AS gl
    WHERE
        gl.queue_name = grader_loads_current.queue_name
        AND (now() - gl.date) < grader_load_interval;

    -- ######################################################################
    -- total number of users looking at an externally-graded question

    SELECT count(*)
    INTO current_users
    FROM
        current_pages AS cp
        JOIN questions AS q ON (q.id = cp.question_id)
    WHERE
        cp.date > now() - interval '1 hour'
        AND q.grading_method = 'External';

    -- ######################################################################
    -- load per user

    grading_jobs_per_user := current_jobs / greatest(current_users, 1);

    SELECT coalesce(avg(value), 0)
    INTO average_grading_jobs_per_user
    FROM time_series
    WHERE
        name = 'grading_jobs_per_user'
        AND date > now() - interval '5 minutes';

    SELECT coalesce(max(value), 0)
    INTO history_grading_jobs_per_user
    FROM time_series
    WHERE
        name = 'average_grading_jobs_per_user'
        AND date > now() - history_interval;

    predicted_jobs_by_current_users := history_grading_jobs_per_user * current_users;

    -- ######################################################################
    -- get recent historical load information

    SELECT coalesce(max(value), 0)
    INTO history_jobs
    FROM time_series
    WHERE
        name = 'current_jobs'
        AND date > now() - history_interval;

    SELECT coalesce(max(value), 0)
    INTO predicted_jobs_by_history_users
    FROM time_series
    WHERE
        name = 'predicted_jobs_by_current_users'
        AND date > now() - history_interval;

    -- ######################################################################
    -- calculate the desired number of graders, using several methodologies

    load_perc := current_jobs / greatest(max_jobs, 1) * 100;
    jobs_per_instance := greatest(max_jobs / greatest(instance_count_in_service, 1), 1);
    desired_instances_by_ungraded_jobs := ungraded_jobs / jobs_per_instance;
    desired_instances_by_current_jobs := current_jobs * current_capacity_factor / jobs_per_instance;
    desired_instances_by_history_jobs := history_jobs * history_capacity_factor / jobs_per_instance;
    desired_instances_by_current_users := predicted_jobs_by_current_users / jobs_per_instance;
    desired_instances_by_history_users := predicted_jobs_by_history_users / jobs_per_instance;
    desired_instances_current := ceiling(greatest(
        1,
        desired_instances_by_ungraded_jobs,
        desired_instances_by_current_jobs,
        desired_instances_by_history_jobs,
        desired_instances_by_current_users,
        desired_instances_by_history_users
    ));

    -- ######################################################################
    -- anti-flapping using historical information

    SELECT coalesce(max(value), 0)
    INTO desired_instances_history
    FROM time_series
    WHERE
        name = 'desired_instances_current'
        AND date > now() - history_interval;

    desired_instances := greatest(desired_instances_current, desired_instances_history);

    -- ######################################################################
    -- write data to time_series table

    INSERT INTO time_series (name, value)
    VALUES
        ('instance_count', instance_count),
        ('instance_count_launching', instance_count_launching),
        ('instance_count_in_service', instance_count_in_service),
        ('instance_count_abandoning_launch', instance_count_abandoning_launch),
        ('instance_count_unhealthy', instance_count_unhealthy),
        ('current_jobs', current_jobs),
        ('max_jobs', max_jobs),
        ('load_perc', load_perc),
        ('ungraded_jobs', ungraded_jobs),
        ('ungraded_jobs_in_submit', ungraded_jobs_in_submit),
        ('ungraded_jobs_in_queue', ungraded_jobs_in_queue),
        ('ungraded_jobs_in_prepare', ungraded_jobs_in_prepare),
        ('ungraded_jobs_in_run', ungraded_jobs_in_run),
        ('ungraded_jobs_in_report', ungraded_jobs_in_report),
        ('age_of_oldest_job_sec', age_of_oldest_job_sec),
        ('age_of_oldest_job_in_submit_sec', age_of_oldest_job_in_submit_sec),
        ('age_of_oldest_job_in_queue_sec', age_of_oldest_job_in_queue_sec),
        ('age_of_oldest_job_in_prepare_sec', age_of_oldest_job_in_prepare_sec),
        ('age_of_oldest_job_in_run_sec', age_of_oldest_job_in_run_sec),
        ('age_of_oldest_job_in_report_sec', age_of_oldest_job_in_report_sec),
        ('history_jobs', history_jobs),
        ('current_users', current_users),
        ('grading_jobs_per_user', grading_jobs_per_user),
        ('average_grading_jobs_per_user', average_grading_jobs_per_user),
        ('history_grading_jobs_per_user', history_grading_jobs_per_user),
        ('predicted_jobs_by_current_users', predicted_jobs_by_current_users),
        ('predicted_jobs_by_history_users', predicted_jobs_by_history_users),
        ('jobs_per_instance', jobs_per_instance),
        ('desired_instances_by_ungraded_jobs', desired_instances_by_ungraded_jobs),
        ('desired_instances_by_current_jobs', desired_instances_by_current_jobs),
        ('desired_instances_by_history_jobs', desired_instances_by_history_jobs),
        ('desired_instances_by_current_users', desired_instances_by_current_users),
        ('desired_instances_by_history_users', desired_instances_by_history_users),
        ('desired_instances_current', desired_instances_current),
        ('desired_instances_history', desired_instances_history),
        ('desired_instances', desired_instances);

    -- ######################################################################
    -- timestamp for sending to CloudWatch

    SET LOCAL timezone TO 'UTC';
    timestamp_formatted := to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';
END;
$$ LANGUAGE plpgsql VOLATILE;
