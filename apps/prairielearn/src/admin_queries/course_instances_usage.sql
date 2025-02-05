WITH
  course_instances_student_usage AS (
    SELECT
      ci.id AS course_instance_id,
      count(DISTINCT u.user_id) AS total_students,
      count(
        DISTINCT u.user_id
        WHERE
          u.institution_id != i.id
      ) AS outside_students
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
      JOIN course_instance_usage_data AS ciud ON (ciud.course_instance_id = ci.id)
      JOIN users AS u ON (u.user_id = ciud.user_id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name IS NULL
      )
      AND ciud.type = 'Submisson'
      AND ciud.date BETWEEN $start_date AND $end_date
      AND ciud.include_in_statistics
    GROUP BY
      ci.id
  ),
  course_instances_external_grading_usage AS (
    SELECT
      ci.id AS course_instance_id,
      EXTRACT(
        EPOCH
        FROM
          sum(ciud.duration)
      ) / 3600 AS duration_hours
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
      JOIN course_instance_usage_data AS ciud ON (ciud.course_instance_id = ci.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name IS NULL
      )
      AND ciud.type = 'External grading'
      AND ciud.date BETWEEN $start_date AND $end_date
      AND ciud.include_in_statistics
    GROUP BY
      ci.id
  ),
  course_instances_workspace_usage AS (
    SELECT
      ci.id AS course_instance_id,
      EXTRACT(
        EPOCH
        FROM
          sum(ciud.duration)
      ) / 3600 AS duration_hours
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
      JOIN course_instance_usage_data AS ciud ON (ciud.course_instance_id = ci.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name IS NULL
      )
      AND ciud.type = 'Workspace'
      AND ciud.date BETWEEN $start_date AND $end_date
      AND ciud.include_in_statistics
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
  coalesce(cisu.total_students, 0) AS total_students,
  -- number of students in the course instance who are from a different institution
  coalesce(cisu.outside_students, 0) AS outside_students,
  -- running duration of external grading jobs (in hours)
  coalesce(ciegu.duration_hours, 0) AS external_grading_hours,
  -- running duration of workspaces (in hours)
  coalesce(ciwu.duration_hours, 0) AS workspace_hours,
  -- total compute time for both workspaces and external grading jobs (in hours)
  coalesce(ciegu.duration_hours, 0) + coalesce(ciwu.duration_hours, 0) AS total_compute_hours
FROM
  institutions AS i
  JOIN pl_courses AS c ON (c.institution_id = i.id)
  JOIN course_instances AS ci ON (ci.course_id = c.id)
  LEFT JOIN course_instances_student_usage AS cisu ON (cisu.course_instance_id = ci.id)
  LEFT JOIN course_instances_external_grading_usage AS ciegu ON (ciegu.course_instance_id = ci.id)
  LEFT JOIN course_instances_workspace_usage AS ciwu ON (ciwu.course_instance_id = ci.id)
WHERE
  (
    i.short_name = $institution_short_name::text
    OR $institution_short_name IS NULL
  )
  AND (
    cisu.course_instance_id IS NOT NULL
    OR ciegu.course_instance_id IS NOT NULL
    OR ciwu.course_instance_id IS NOT NULL
  )
ORDER BY
  i.short_name,
  i.id,
  c.short_name,
  c.id,
  ci.short_name,
  ci.id;
