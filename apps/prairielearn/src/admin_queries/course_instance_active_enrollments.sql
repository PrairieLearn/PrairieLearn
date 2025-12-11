WITH
  course_instance_user_data AS (
    -- We filter using ai.modified_at and iq.modified_at for efficiency. This
    -- means we might miss some activity (e.g., if a student has later worked on
    -- a question or assessment) but this should be accurate enough when we are
    -- looking at whole terms.
    SELECT
      ci.id AS course_instance_id,
      u.id,
      (i.id = u.institution_id) AS is_institution_user,
      count(*) AS instance_question_count
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
      JOIN assessments AS a ON (a.course_instance_id = ci.id)
      JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN users AS u ON (u.id = iq.authn_user_id)
    WHERE
      i.short_name = $institution_short_name
      AND ai.modified_at BETWEEN $start_date AND $end_date
      AND ai.include_in_statistics
      AND iq.modified_at BETWEEN $start_date AND $end_date
    GROUP BY
      ci.id,
      u.id,
      i.id,
      u.institution_id
  ),
  course_instance_data AS (
    SELECT
      course_instance_id,
      count(*) AS total_students,
      count(*) FILTER (
        WHERE
          NOT is_institution_user
      ) AS outside_students,
      sum(instance_question_count) AS instance_question_count
    FROM
      course_instance_user_data
    WHERE
      instance_question_count >= $minimum_instance_question_count
    GROUP BY
      course_instance_id
  ),
  workspace_data AS (
    -- We exhaustively find all workspaces in the given time range and then
    -- filter them down to only those that are associated with a course
    -- instance. This is more thorough than the approach above for instance
    -- questions because we don't want to miss any compute activity.
    SELECT
      ci.id AS course_instance_id,
      COUNT(*) AS workspace_count,
      sum(
        extract(
          EPOCH
          FROM
            w.launching_duration + w.running_duration
        ) / 3600.0
      ) AS workspace_hours
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
      JOIN assessments AS a ON (a.course_instance_id = ci.id)
      JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN workspaces AS w ON (w.id = v.workspace_id)
    WHERE
      i.short_name = $institution_short_name
      AND w.created_at BETWEEN $start_date AND $end_date
    GROUP BY
      ci.id
  ),
  grading_job_data AS (
    -- We use a similar exhaustive approach for grading jobs as we do for
    -- workspaces above.
    SELECT
      ci.id AS course_instance_id,
      COUNT(*) AS external_grading_count,
      sum(
        extract(
          EPOCH
          FROM
            gj.grading_finished_at - gj.grading_received_at
        ) / 3600.0
      ) AS external_grading_hours
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
      JOIN assessments AS a ON (a.course_instance_id = ci.id)
      JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
      i.short_name = $institution_short_name
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
  -- number of students in the course instance
  coalesce(cid.total_students, 0) AS total_students,
  -- number of students in the course instance who are from a different institution
  coalesce(cid.outside_students, 0) AS outside_students,
  -- number of instance questions
  coalesce(cid.instance_question_count, 0) AS instance_question_count,
  -- number of workspaces in each course instance
  coalesce(wd.workspace_count, 0) AS workspace_count,
  -- running duration of workspaces (in hours)
  coalesce(wd.workspace_hours, 0) AS workspace_hours,
  -- number of external grading jobs in each course instance
  coalesce(gjd.external_grading_count, 0) AS external_grading_count,
  -- running duration of external grading jobs (in hours)
  coalesce(gjd.external_grading_hours, 0) AS external_grading_hours,
  -- total compute time for both workspaces and external grading jobs (in hours)
  coalesce(wd.workspace_hours, 0) + coalesce(gjd.external_grading_hours, 0) AS total_compute_hours
FROM
  institutions AS i
  JOIN pl_courses AS c ON (c.institution_id = i.id)
  JOIN course_instances AS ci ON (ci.course_id = c.id)
  LEFT JOIN course_instance_data AS cid ON (cid.course_instance_id = ci.id)
  LEFT JOIN workspace_data AS wd ON (wd.course_instance_id = ci.id)
  LEFT JOIN grading_job_data AS gjd ON (gjd.course_instance_id = ci.id)
WHERE
  i.short_name = $institution_short_name
  AND (
    cid.course_instance_id IS NOT NULL
    OR wd.course_instance_id IS NOT NULL
    OR gjd.course_instance_id IS NOT NULL
  )
ORDER BY
  i.short_name,
  c.short_name,
  ci.short_name,
  ci.id;
