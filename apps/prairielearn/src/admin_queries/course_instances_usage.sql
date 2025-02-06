WITH
  selected_course_instance_usages AS (
    SELECT
      ciu.*
    FROM
      institutions AS i
      JOIN course_instance_usages AS ciu ON (ciu.institution_id = ci.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name IS NULL
      )
      AND ciud.date BETWEEN $start_date AND $end_date
  ),
  course_instances_data AS (
    SELECT
      ciu.course_instance_id,
      count(DISTINCT u.user_id) AS total_students,
      count(
        DISTINCT u.user_id
        WHERE
          u.institution_id != i.id
      ) AS outside_students,
      EXTRACT(
        EPOCH
        FROM
          sum(
            ciu.duration
            WHERE
              ciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(
            ciu.duration
            WHERE
              ciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      selected_course_instance_usages AS ciu
      JOIN users AS u ON (u.user_id = ciu.user_id)
    WHERE
      ciu.include_in_statistics
    GROUP BY
      ciu.course_instance_id
  ),
  courses_usage_data AS (
    SELECT
      ciu.course_id,
      count(DISTINCT ciu.user_id) AS total_staff,
      EXTRACT(
        EPOCH
        FROM
          sum(
            ciu.duration
            WHERE
              ciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(
            ciu.duration
            WHERE
              ciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      selected_course_instance_usages AS ciu
    WHERE
      ciu.type = 'Submission'
      AND NOT ciu.include_in_statistics
    GROUP BY
      ciu.course_id
  )
SELECT
  i.short_name AS institution,
  c.short_name AS course,
  c.id AS course_id,
  ci.short_name AS course_instance,
  ci.id AS course_instance_id,
  -- number of staff in the course
  coalesce(cud.total_staff, 0) AS total_staff,
  -- number of students in the course instance
  coalesce(ciud.total_students, 0) AS total_students,
  -- number of students in the course instance who are from a different institution
  coalesce(ciud.outside_students, 0) AS outside_students,
  -- running duration of external grading jobs (in hours)
  coalesce(
    ciud.external_grading_hours,
    cud.external_grading_hours,
    0
  ) AS external_grading_hours,
  -- running duration of workspaces (in hours)
  coalesce(ciud.workspace_hours, cud.workspace_hours, 0) AS workspace_hours,
  -- total compute time for both workspaces and external grading jobs (in hours)
  coalesce(
    ciud.external_grading_hours,
    cud.external_grading_hours,
    0
  ) + coalesce(ciud.workspace_hours, cud.workspace_hours, 0) AS total_compute_hours
FROM
  institutions AS i
  JOIN pl_courses AS c ON (c.institution_id = i.id)
  JOIN course_instances AS ci ON (ci.course_id = c.id)
  LEFT JOIN course_instances_usage_data AS ciud ON (ciud.course_instance_id = ci.id)
  LEFT JOIN courses_usage_data AS cud ON (cud.course_id = c.id)
WHERE
  (
    i.short_name = $institution_short_name::text
    OR $institution_short_name IS NULL
  )
  AND (
    ciud.course_instance_id IS NOT NULL
    OR cud.course_id IS NOT NULL
  )
ORDER BY
  i.short_name,
  i.id,
  c.short_name,
  c.id,
  ci.short_name,
  ci.id;
