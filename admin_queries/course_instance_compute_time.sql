WITH
  workspace_durations AS (
    SELECT
      ci.id AS course_instance_id,
      COUNT(DISTINCT w.id) AS workspace_count,
      sum(
        extract(
          epoch
          from
            w.launching_duration + w.running_duration
        ) / 3600.0
      ) AS duration_hours
    FROM
      workspaces AS w
      JOIN variants AS v ON (v.workspace_id = w.id)
      JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
      JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN pl_courses AS c ON (c.id = ci.course_id)
      JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
      (
        $institution_short_name = ''
        OR i.short_name = $institution_short_name
      )
      AND w.created_at BETWEEN $start_date AND $end_date
    GROUP BY
      ci.id
  ),
  grading_job_durations AS (
    SELECT
      ci.id AS course_instance_id,
      COUNT(DISTINCT gj.id) AS grading_job_count,
      sum(
        extract(
          epoch
          from
            gj.grading_finished_at - gj.grading_received_at
        ) / 3600.0
      ) AS duration_hours
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
      (
        $institution_short_name = ''
        OR i.short_name = $institution_short_name
      )
      AND (gj.date BETWEEN $start_date AND $end_date)
      AND gj.grading_method = 'External'
    GROUP BY
      ci.id
  )
SELECT
  i.short_name AS institution,
  c.short_name AS course,
  c.id AS course_id,
  ci.short_name AS course_instance,
  ci.id AS course_instance_id,
  -- total number of workspaces in each course instance
  coalesce(wd.workspace_count, 0) AS workspace_count,
  -- total running duration of workspaces (in hours)
  coalesce(wd.duration_hours, 0) AS workspace_hours,
  -- average running duration of workspaces (in hours)
  coalesce(wd.duration_hours, 0) / coalesce(wd.workspace_count, 1) AS avg_hours_per_workspace,
  -- total number of external grading jobs in each course instance
  coalesce(gjd.grading_job_count, 0) AS external_grading_count,
  -- total running duration of external grading jobs (in hours)
  coalesce(gjd.duration_hours, 0) AS external_grading_hours,
  -- average running duration of external grading jobs (in seconds)
  coalesce(gjd.duration_hours * 3600, 0) / coalesce(gjd.grading_job_count, 1) AS avg_seconds_per_grading_job,
  -- total compute time for both workspaces and external grading jobs (in hours)
  coalesce(wd.duration_hours, 0) + coalesce(gjd.duration_hours, 0) AS total_compute_hours
FROM
  workspace_durations AS wd
  FULL JOIN grading_job_durations AS gjd ON (gjd.course_instance_id = wd.course_instance_id)
  JOIN course_instances AS ci ON (
    ci.id = coalesce(wd.course_instance_id, gjd.course_instance_id)
  )
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  coalesce(wd.duration_hours, 0) + coalesce(gjd.duration_hours, 0) >= $minimum_compute_hours
ORDER BY
  i.short_name,
  c.short_name,
  ci.short_name,
  ci.id;
