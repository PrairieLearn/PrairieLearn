WITH
  -- First we select all usage data for the given institution(s) and time range.
  selected_course_instance_usages AS (
    SELECT
      ciu.*
    FROM
      institutions AS i
      JOIN course_instance_usages AS ciu ON (ciu.institution_id = i.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name::text = ''
        OR $institution_short_name::text IS NULL
      )
      AND ciu.date BETWEEN $start_date AND $end_date
  ),
  -- Now we'll select out the student usage data. This is all data with
  -- `include_in_statistics` set to true. We also set the `total_staff` to NULL
  -- for the later UNION. This student data must have a `course_instance_id`.
  student_course_instances_usage_data AS (
    SELECT
      sciu.course_id,
      sciu.course_instance_id,
      NULL::bigint AS total_staff,
      count(DISTINCT u.user_id) AS total_students,
      count(DISTINCT u.user_id) FILTER (
        WHERE
          u.institution_id != i.id
      ) AS outside_students,
      EXTRACT(
        EPOCH
        FROM
          sum(sciu.duration) FILTER (
            WHERE
              sciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(sciu.duration) FILTER (
            WHERE
              sciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      selected_course_instance_usages AS sciu
      JOIN institutions AS i ON (i.id = sciu.institution_id)
      JOIN users AS u ON (u.user_id = sciu.user_id)
    WHERE
      sciu.include_in_statistics
    GROUP BY
      sciu.course_id,
      sciu.course_instance_id
  ),
  -- Now we get the staff usage data. This is all data with
  -- `include_in_statistics` set to false. We also set the `total_students` and
  -- `outside_students` to NULL for the later UNION. This staff data might or
  -- might not have a `course_instance_id`, depending on whether the usage was
  -- within a course instance context, but we display all staff usage only at
  -- the course level, so we set the `course_instance_id` to NULL.
  staff_courses_usage_data AS (
    SELECT
      sciu.course_id,
      NULL::bigint AS course_instance_id,
      count(DISTINCT sciu.user_id) AS total_staff,
      NULL::bigint AS total_students,
      NULL::bigint AS outside_students,
      EXTRACT(
        EPOCH
        FROM
          sum(sciu.duration) FILTER (
            WHERE
              sciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(sciu.duration) FILTER (
            WHERE
              sciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      selected_course_instance_usages AS sciu
    WHERE
      sciu.type = 'Submission'
      AND NOT sciu.include_in_statistics
    GROUP BY
      sciu.course_id
  ),
  -- As the final step, we combine the student and staff usage data into a single
  -- table. The above queries are designed to have the same columns, so we can
  -- just UNION them together.
  combined_data AS (
    (
      SELECT
        *
      FROM
        student_course_instances_usage_data
    )
    UNION ALL
    (
      SELECT
        *
      FROM
        staff_courses_usage_data
    )
  )
SELECT
  i.short_name AS institution,
  c.short_name AS course,
  c.id AS course_id,
  ci.short_name AS course_instance,
  ci.id AS course_instance_id,
  -- number of course staff
  cd.total_staff,
  -- total number of students
  cd.total_students,
  -- number of students from a different institution
  cd.outside_students,
  -- running duration of external grading jobs (in hours)
  cd.external_grading_hours,
  -- running duration of workspaces (in hours)
  cd.workspace_hours,
  -- total compute time for both workspaces and external grading jobs (in hours)
  coalesce(cd.external_grading_hours, 0) + coalesce(cd.workspace_hours, 0) AS total_compute_hours
FROM
  combined_data AS cd
  LEFT JOIN course_instances AS ci ON (ci.id = cd.course_instance_id)
  JOIN pl_courses AS c ON (c.id = cd.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
ORDER BY
  i.short_name,
  i.id,
  c.short_name,
  c.id,
  ci.short_name,
  ci.id;
