WITH
  institution_usage_data AS (
    SELECT
      ciu.institution_id,
      count(DISTINCT ciu.user_id) AS users,
      EXTRACT(
        EPOCH
        FROM
          sum(ciu.duration) FILTER (
            WHERE
              ciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(ciu.duration) FILTER (
            WHERE
              ciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      course_instance_usages AS ciu
    WHERE
      ciu.date BETWEEN $start_date AND $end_date
    GROUP BY
      ciu.institution_id
  )
SELECT
  i.short_name AS institution,
  coalesce(iud.users, 0) AS users,
  coalesce(iud.external_grading_hours, 0) AS external_grading_hours,
  coalesce(iud.workspace_hours, 0) AS workspace_hours
FROM
  institution_usage_data AS iud
  JOIN institutions AS i ON (i.id = iud.institution_id)
ORDER BY
  i.short_name,
  i.id;
