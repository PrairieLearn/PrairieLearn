WITH
workspace_durations AS (
    SELECT
        ci.id AS course_instance_id,
        w.id AS workspace_id,
        CASE WHEN (lag(wl.state) OVER win) = 'running' AND wl.state = 'stopped' THEN wl.date - (lag(wl.date) OVER win) ELSE make_interval(secs => 0) END AS duration
    FROM
        workspace_logs AS wl
        JOIN workspaces AS w ON (w.id = wl.workspace_id)
        JOIN variants AS v ON (v.workspace_id = w.id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
        ($institution_short_name = '' OR i.short_name = $institution_short_name)
        AND wl.date BETWEEN $start_date AND $end_date
    WINDOW
        win AS (PARTITION BY ci.id, w.id ORDER BY wl.date)
    ORDER BY
        ci.id, w.id
),
total_workspace_durations AS (
    SELECT
        course_instance_id,
        COUNT(DISTINCT workspace_id) AS workspace_count,
        SUM(duration) AS total_duration
    FROM
        workspace_durations
    GROUP BY
        course_instance_id
),
grading_job_durations AS (
    SELECT
        ci.id AS course_instance_id,
        gj.id AS grading_job_id,
        gj.grading_finished_at - gj.grading_started_at AS duration
    FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
        ($institution_short_name = '' OR i.short_name = $institution_short_name)
        AND gj.date BETWEEN $start_date AND $end_date
        AND gj.grading_method = 'External'
    ORDER BY
        ci.id, gj.id
),
total_grading_job_durations AS (
    SELECT
        course_instance_id,
        COUNT(DISTINCT grading_job_id) AS grading_job_count,
        extract(EPOCH FROM SUM(duration)) AS total_duration_hours
    FROM
        grading_job_durations
    GROUP BY
        course_instance_id
)
SELECT
    i.short_name AS institution,
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,

    -- total number of workspaces in each course instance
    coalesce(twd.workspace_count, 0) AS workspace_count,

    -- total running duration of workspaces (in hours)
    coalesce(twd.total_duration_hours, 0) AS workspace_hours,

    -- average running duration of workspaces (in hours)
    coalesce(twd.total_duration_hours, 0) / coalesce(twd.workspace_count, 1) AS avg_hours_per_workspace,

    -- total number of external grading jobs in each course instance
    coalesce(tgjd.grading_job_count, 0) AS external_grading_count,

    -- total running duration of external grading jobs (in hours)
    coalesce(tgjd.total_duration_hours, 0) AS external_grading_hours,

    -- average running duration of external grading jobs (in seconds)
    coalesce(tgjd.total_duration_hours * 3600, 0) / coalesce(tgjd.grading_job_count, 1) AS avg_seconds_per_grading_job,

    -- total compute time for both workspaces and external grading jobs (in hours)
    coalesce(twd.total_duration_hours, 0) + coalesce(tgjd.total_duration_hours, 0) AS total_compute_hours
FROM
    total_workspace_durations AS twd
    FULL JOIN total_grading_job_durations AS tgjd ON (tgjd.course_instance_id = twd.course_instance_id)
    JOIN course_instances AS ci ON (ci.id = coalesce(twd.course_instance_id, tgjd.course_instance_id))
    JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
    coalesce(twd.total_duration_hours, 0) + coalesce(tgjd.total_duration_hours, 0) >= $minimum_compute_hours
ORDER BY
    i.short_name,
    c.short_name,
    ci.short_name,
    ci.id;
